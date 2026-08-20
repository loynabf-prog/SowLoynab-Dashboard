import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { pickMimeType, sendVoice, type VoiceIntent, type VoiceIntentType } from '../lib/voice'
import { generateIdeas } from '../lib/ideas'
import type { Client } from '../lib/types'
import Modal from './Modal'

interface Opt { id: string; name: string }

type Phase = 'idle' | 'recording' | 'working'

const TYPE_LABEL: Record<VoiceIntentType, string> = {
  task: 'Aufgabe',
  lead: 'Lead',
  video: 'Videoidee',
  ideas: 'KI-Ideen',
  unknown: 'Unklar',
}

export default function VoiceButton() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<{ transcript: string; intent: VoiceIntent | null } | null>(null)
  const [clients, setClients] = useState<Opt[]>([])
  const [leads, setLeads] = useState<Opt[]>([])

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeRef = useRef<string>('')

  // Kunden/Leads fuer Kontext + Zuordnung laden.
  async function loadContext() {
    const [c, l] = await Promise.all([
      supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('leads').select('id, name').is('deleted_at', null).order('name'),
    ])
    const cl = (c.data ?? []) as Opt[]
    const le = (l.data ?? []) as Opt[]
    setClients(cl)
    setLeads(le)
    return { clients: cl, leads: le }
  }

  useEffect(() => {
    loadContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Dein Browser unterstützt keine Sprachaufnahme. Nutze Safari/Chrome aktuell.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMimeType()
      mimeRef.current = mime
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => finish()
      rec.start()
      recorderRef.current = rec
      setPhase('recording')
    } catch (e) {
      setError('Kein Zugriff aufs Mikrofon. Bitte in den Einstellungen erlauben.')
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function stop() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  function cancel() {
    const rec = recorderRef.current
    if (rec) rec.onstop = null
    if (rec && rec.state !== 'inactive') rec.stop()
    stopTracks()
    chunksRef.current = []
    setPhase('idle')
  }

  async function finish() {
    stopTracks()
    setPhase('working')
    try {
      const mime = mimeRef.current
      const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
      if (blob.size < 800) {
        setError('Zu kurz – nichts aufgenommen. Halte den Knopf und sprich einen Satz.')
        setPhase('idle')
        return
      }
      const ctx = await loadContext()
      const res = await sendVoice(blob, mime, {
        today: new Date().toISOString().slice(0, 10),
        clients: ctx.clients,
        leads: ctx.leads,
        members: [],
      })
      setPhase('idle')
      if (!res.transcript) {
        setError('Nichts verstanden. Bitte nochmal – etwas näher am Mikro.')
        return
      }
      setReview(res)
    } catch (e) {
      setPhase('idle')
      setError((e as Error).message)
    }
  }

  return (
    <>
      <button
        className={`voice-fab ${phase === 'recording' ? 'rec' : ''} ${phase === 'working' ? 'busy' : ''}`}
        onClick={() => (phase === 'recording' ? stop() : phase === 'idle' ? start() : undefined)}
        aria-label={phase === 'recording' ? 'Aufnahme beenden' : 'Sprachbefehl'}
        title="Sprachbefehl: Aufgabe, Lead oder Videoidee einsprechen"
      >
        {phase === 'working' ? <span className="voice-spin" /> : phase === 'recording' ? '■' : '🎤'}
      </button>

      {phase === 'recording' && (
        <div className="voice-hint">
          <span className="voice-live"><i /> Ich höre zu … sprich frei</span>
          <div className="voice-hint-actions">
            <button className="btn btn-sm btn-ghost" onClick={cancel}>Abbrechen</button>
            <button className="btn btn-sm btn-primary" onClick={stop}>Fertig</button>
          </div>
        </div>
      )}
      {phase === 'working' && <div className="voice-hint"><span className="voice-live">Verarbeite …</span></div>}

      {error && (
        <div className="voice-hint err" onClick={() => setError(null)}>
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost">OK</button>
        </div>
      )}

      {review && (
        <ReviewModal
          transcript={review.transcript}
          intent={review.intent}
          clients={clients}
          leads={leads}
          userId={user?.id ?? null}
          onClose={() => setReview(null)}
          onDone={(msg, undo) => {
            setReview(null)
            toast(msg, undo ? { label: 'Rückgängig', onClick: undo } : undefined)
          }}
        />
      )}
    </>
  )
}

// ---- Zuordnung Name -> ID (tippfehler-tolerant) -----------------------------
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '')
}
function matchId(name: string | null | undefined, opts: Opt[]): string {
  if (!name) return ''
  const n = norm(name)
  if (!n) return ''
  let best = ''
  for (const o of opts) {
    const on = norm(o.name)
    if (on === n) return o.id
    if (on.includes(n) || n.includes(on)) best = o.id
  }
  return best
}

function ReviewModal({
  transcript,
  intent,
  clients,
  leads,
  userId,
  onClose,
  onDone,
}: {
  transcript: string
  intent: VoiceIntent | null
  clients: Opt[]
  leads: Opt[]
  userId: string | null
  onClose: () => void
  onDone: (msg: string, undo?: () => void) => void
}) {
  const navigate = useNavigate()
  const [type, setType] = useState<VoiceIntentType>(intent?.type && intent.type !== 'unknown' ? intent.type : 'task')
  const [title, setTitle] = useState(intent?.title || intent?.name || '')
  const [name, setName] = useState(intent?.name || intent?.title || '')
  const [clientId, setClientId] = useState(() => matchId(intent?.client_name, clients))
  const [leadId, setLeadId] = useState(() => matchId(intent?.lead_name, leads))
  const [date, setDate] = useState(intent?.date || '')
  const [time, setTime] = useState(intent?.time || '')
  const [contact, setContact] = useState(intent?.contact_person || '')
  const [phone, setPhone] = useState(intent?.phone || '')
  const [email, setEmail] = useState(intent?.email || '')
  const [city, setCity] = useState(intent?.city || '')
  const [notes, setNotes] = useState(intent?.notes || '')
  const [count, setCount] = useState(intent?.count && intent.count > 0 ? Math.min(intent.count, 12) : 5)
  const [theme, setTheme] = useState(intent?.theme || '')
  const [gen, setGen] = useState<{ title: string; notes: string | null; on: boolean }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      if (type === 'task') {
        if (!title.trim()) { setErr('Bitte einen Titel angeben.'); setBusy(false); return }
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            title: title.trim(),
            due_date: date || null,
            notes: notes.trim() || null,
            client_id: clientId || null,
            lead_id: leadId || null,
            created_by: userId,
          })
          .select('id')
          .single()
        if (error) throw error
        onDone('Aufgabe angelegt ✓', undoFn('tasks', data.id))
        navigate('/aufgaben')
      } else if (type === 'lead') {
        if (!name.trim()) { setErr('Bitte einen Namen angeben.'); setBusy(false); return }
        const { data, error } = await supabase
          .from('leads')
          .insert({
            name: name.trim(),
            contact_person: contact.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            city: city.trim() || null,
            notes: notes.trim() || null,
            next_followup: date || null,
            stage: 'new',
            created_by: userId,
          })
          .select('id')
          .single()
        if (error) throw error
        onDone('Lead angelegt ✓', undoFn('leads', data.id))
        navigate('/leads')
      } else {
        // video
        if (!clientId) { setErr('Bitte einen Kunden auswählen.'); setBusy(false); return }
        if (!title.trim()) { setErr('Bitte eine Idee/Titel angeben.'); setBusy(false); return }
        const { data, error } = await supabase
          .from('videos')
          .insert({
            client_id: clientId,
            title: title.trim(),
            status: 'todo',
            scheduled_date: date || null,
            scheduled_time: time || null,
            notes: notes.trim() || null,
            created_by: userId,
          })
          .select('id')
          .single()
        if (error) throw error
        onDone('Videoidee angelegt ✓', undoFn('videos', data.id))
        navigate(`/client/${clientId}`)
      }
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  function undoFn(table: string, id: string) {
    return async () => {
      await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    }
  }

  // ---- KI-Ideen aus Sprachbefehl ("Gib mir 5 Videoideen für …") ----
  async function runIdeas() {
    if (!clientId) { setErr('Bitte einen Kunden auswählen.'); return }
    setBusy(true)
    setErr(null)
    try {
      const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
      if (!client) throw new Error('Kunde nicht gefunden.')
      const ideas = await generateIdeas(client as Client, count, theme.trim() || null, [])
      setGen(ideas.map((i) => ({ title: i.title, notes: i.notes, on: true })))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveIdeas() {
    const chosen = (gen ?? []).filter((g) => g.on)
    if (!clientId || chosen.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      const { data, error } = await supabase
        .from('video_ideas')
        .insert(chosen.map((g) => ({ client_id: clientId, title: g.title, notes: g.notes, source: 'ai', created_by: userId })))
        .select('id')
      if (error) throw error
      const ids = (data ?? []).map((r: any) => r.id)
      onDone(`${chosen.length} Ideen im Ideenspeicher ✓`, async () => {
        if (ids.length) await supabase.from('video_ideas').update({ deleted_at: new Date().toISOString() }).in('id', ids)
      })
      navigate(`/client/${clientId}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Sprachbefehl prüfen" onClose={onClose}>
      <div className="stack">
        <div className="voice-transcript">
          <span className="voice-transcript-label">🎧 Verstanden</span>
          <p>„{transcript}"</p>
        </div>

        {err && <div className="error-box">{err}</div>}

        <div>
          <label>Das ist eine …</label>
          <div className="seg voice-typeseg">
            {(['task', 'lead', 'video', 'ideas'] as VoiceIntentType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`seg-btn ${type === t ? 'on' : ''}`}
                onClick={() => { setType(t); setGen(null) }}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {type === 'ideas' ? (
          <>
            {!gen ? (
              <>
                <div>
                  <label>Kunde *</label>
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">— Kunde wählen —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label>Wie viele?</label>
                    <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} Ideen</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label>Schwerpunkt (optional)</label>
                    <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="z. B. Weihnachtsaktion" />
                  </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={runIdeas} disabled={busy || !clientId}>
                  {busy ? 'KI denkt nach …' : `✨ ${count} Ideen erstellen`}
                </button>
              </>
            ) : (
              <>
                <p className="muted">Häkchen raus = wird nicht gespeichert.</p>
                <div className="ai-idea-list">
                  {gen.map((r, idx) => (
                    <label className={`ai-idea ${r.on ? 'on' : ''}`} key={idx}>
                      <input
                        type="checkbox"
                        checked={r.on}
                        onChange={(e) => setGen((prev) => prev!.map((x, i) => (i === idx ? { ...x, on: e.target.checked } : x)))}
                      />
                      <span>
                        <span className="ai-idea-title">{r.title}</span>
                        {r.notes && <span className="ai-idea-notes">{r.notes}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setGen(null)}>← Neu</button>
                  <div className="spacer" />
                  <button type="button" className="btn btn-primary" onClick={saveIdeas} disabled={busy || gen.every((g) => !g.on)}>
                    {gen.filter((g) => g.on).length} in den Speicher
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
        <>

        {type === 'lead' ? (
          <div>
            <label>Betrieb / Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="z. B. Restaurant Sahin" />
          </div>
        ) : (
          <div>
            <label>{type === 'video' ? 'Videoidee *' : 'Aufgabe *'}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={type === 'video' ? 'z. B. Pasta-Reel drehen' : 'z. B. Restaurant Sahin anrufen'} />
          </div>
        )}

        {type === 'video' && (
          <div>
            <label>Kunde *</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Kunde wählen —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {type === 'task' && (
          <div>
            <label>Verknüpfen mit (optional)</label>
            <select
              value={clientId ? `client:${clientId}` : leadId ? `lead:${leadId}` : ''}
              onChange={(e) => {
                const v = e.target.value
                setClientId(v.startsWith('client:') ? v.slice(7) : '')
                setLeadId(v.startsWith('lead:') ? v.slice(5) : '')
              }}
            >
              <option value="">— nichts —</option>
              {clients.length > 0 && (
                <optgroup label="Kunden">
                  {clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}
                </optgroup>
              )}
              {leads.length > 0 && (
                <optgroup label="Leads">
                  {leads.map((l) => <option key={l.id} value={`lead:${l.id}`}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
        )}

        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>{type === 'lead' ? 'Follow-up am' : type === 'video' ? 'Posten am' : 'Fällig am'}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {type === 'video' && (
            <div style={{ flex: 1 }}>
              <label>Uhrzeit</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          )}
        </div>

        {type === 'lead' && (
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>Ansprechpartner</label>
              <input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>Telefon</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>E-Mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>Ort</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <label>Notizen</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Speichere …' : 'Anlegen'}
          </button>
        </div>
        </>
        )}
      </div>
    </Modal>
  )
}
