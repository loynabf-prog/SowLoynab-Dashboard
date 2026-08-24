import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { occurrences, type RepeatRule } from '../lib/recurrence'
import { insertRows } from '../lib/db'
import RepeatPicker from './RepeatPicker'
import Modal from './Modal'

type QType = 'task' | 'lead' | 'video' | 'backfill'
interface Opt { id: string; name: string; handle_ig?: string | null; handle_tiktok?: string | null }

interface PlatformResult {
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  caption: string | null
  username: string | null
  postedAt: string | null
  duration: number | null
}
interface LookupResult { tiktok: PlatformResult | null; instagram: PlatformResult | null }

const TABS: { key: QType; label: string; icon: string }[] = [
  { key: 'task', label: 'Aufgabe', icon: '✓' },
  { key: 'lead', label: 'Lead', icon: '🎯' },
  { key: 'video', label: 'Video', icon: '🎬' },
  { key: 'backfill', label: 'Nachtragen', icon: '🔗' },
]

function fmtN(n: number | null | undefined): string {
  if (n == null) return '–'
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k'
  return String(n)
}

function normHandle(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/^@/, '').trim()
}
function matchClientByHandle(handle: string | null, opts: Opt[]): string {
  const h = normHandle(handle)
  if (!h) return ''
  const hit = opts.find((o) => normHandle(o.handle_ig) === h || normHandle(o.handle_tiktok) === h)
  return hit?.id ?? ''
}

// Schnell-Erfassen von überall — per Header-Knopf oder Event "open-quickadd".
export default function QuickAdd() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<QType>('task')
  const [clients, setClients] = useState<Opt[]>([])
  const [leads, setLeads] = useState<Opt[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Felder
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [link, setLink] = useState('') // task: client:<id> | lead:<id>
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [rule, setRule] = useState<RepeatRule>({ kind: 'none' })

  // Nachtragen (Apify-Backfill)
  const [ttUrl, setTtUrl] = useState('')
  const [igUrl, setIgUrl] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [bfTitle, setBfTitle] = useState('')
  const [bfClientId, setBfClientId] = useState('')
  const [bfDate, setBfDate] = useState('')

  useEffect(() => {
    function openEvt(e: Event) {
      const t = (e as CustomEvent).detail?.type as QType | undefined
      if (t) setType(t)
      setOpen(true)
    }
    window.addEventListener('open-quickadd', openEvt as EventListener)
    // ⌘/Strg + I als Kurzbefehl
    function onKey(ev: KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'i') {
        ev.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('open-quickadd', openEvt as EventListener)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setError(null)
    setTitle(''); setName(''); setClientId(''); setLink(''); setDate(''); setTime(''); setCity(''); setPhone(''); setRule({ kind: 'none' })
    setTtUrl(''); setIgUrl(''); setLookup(null); setBfTitle(''); setBfClientId(''); setBfDate('')
    supabase.from('clients').select('id, name, handle_ig, handle_tiktok').is('deleted_at', null).order('name').then(({ data }) => setClients((data ?? []) as Opt[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setLeads((data ?? []) as Opt[]))
  }, [open])

  async function runLookup() {
    if (!igUrl.trim() && !ttUrl.trim()) { setError('Bitte mindestens einen Link einfügen.'); return }
    setLookupBusy(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('apify-lookup', {
        body: { instagram_url: igUrl.trim() || null, tiktok_url: ttUrl.trim() || null },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const res = data as LookupResult
      setLookup(res)
      const handle = res.instagram?.username || res.tiktok?.username || null
      setBfClientId(matchClientByHandle(handle, clients))
      const caption = res.instagram?.caption || res.tiktok?.caption || ''
      setBfTitle(caption ? (caption.length > 70 ? caption.slice(0, 70) + '…' : caption) : '')
      const postedAt = res.instagram?.postedAt || res.tiktok?.postedAt || null
      setBfDate(postedAt ? new Date(postedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLookupBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (rule.kind !== 'none' && !date && (type === 'task' || type === 'video')) {
        setError('Für die Wiederholung bitte ein Startdatum wählen.'); setBusy(false); return
      }
      if (type === 'task') {
        if (!title.trim()) { setError('Bitte einen Titel angeben.'); setBusy(false); return }
        const client_id = link.startsWith('client:') ? link.slice(7) : null
        const lead_id = link.startsWith('lead:') ? link.slice(5) : null
        if (rule.kind !== 'none' && date) {
          const series_id = crypto.randomUUID()
          const dates = occurrences(date, rule)
          const { error } = await insertRows('tasks', dates.map((d) => ({ title: title.trim(), due_date: d, client_id, lead_id, series_id, created_by: user?.id ?? null })))
          if (error) throw error
          toast(`${dates.length} Aufgaben angelegt ✓`)
          navigate('/aufgaben')
          setOpen(false)
          return
        }
        const { error } = await supabase.from('tasks').insert({ title: title.trim(), due_date: date || null, client_id, lead_id, created_by: user?.id ?? null })
        if (error) throw error
        toast('Aufgabe angelegt ✓')
        navigate('/aufgaben')
      } else if (type === 'lead') {
        if (!name.trim()) { setError('Bitte einen Namen angeben.'); setBusy(false); return }
        const { error } = await supabase.from('leads').insert({ name: name.trim(), city: city.trim() || null, phone: phone.trim() || null, next_followup: date || null, stage: 'new', created_by: user?.id ?? null })
        if (error) throw error
        toast('Lead angelegt ✓')
        navigate('/leads')
      } else if (type === 'backfill') {
        if (!lookup) { setError('Bitte zuerst die Daten abrufen.'); setBusy(false); return }
        if (!bfClientId) { setError('Bitte einen Kunden auswählen.'); setBusy(false); return }
        if (!bfTitle.trim()) { setError('Bitte einen Titel angeben.'); setBusy(false); return }
        const tt = lookup.tiktok
        const ig = lookup.instagram
        const sum2 = (a?: number | null, b?: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0))
        const { error } = await insertRows('videos', [{
          client_id: bfClientId,
          title: bfTitle.trim(),
          status: 'posted',
          posted_at: bfDate ? new Date(bfDate + 'T12:00:00').toISOString() : new Date().toISOString(),
          tiktok_url: ttUrl.trim() || null,
          instagram_url: igUrl.trim() || null,
          duration_seconds: tt?.duration ?? ig?.duration ?? null,
          views: sum2(tt?.views, ig?.views),
          likes: sum2(tt?.likes, ig?.likes),
          comments: sum2(tt?.comments, ig?.comments),
          shares: sum2(tt?.shares, ig?.shares),
          saves: sum2(tt?.saves, ig?.saves),
          reach: sum2(tt?.views, ig?.views),
          views_ig: ig?.views ?? null, likes_ig: ig?.likes ?? null, comments_ig: ig?.comments ?? null, shares_ig: ig?.shares ?? null, saves_ig: ig?.saves ?? null,
          views_tiktok: tt?.views ?? null, likes_tiktok: tt?.likes ?? null, comments_tiktok: tt?.comments ?? null, shares_tiktok: tt?.shares ?? null, saves_tiktok: tt?.saves ?? null,
          stats_updated_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        }])
        if (error) throw error
        toast('Altes Video nachgetragen ✓')
        navigate(`/client/${bfClientId}`)
      } else {
        if (!clientId) { setError('Bitte einen Kunden wählen.'); setBusy(false); return }
        if (!title.trim()) { setError('Bitte einen Titel angeben.'); setBusy(false); return }
        if (rule.kind !== 'none' && date) {
          const series_id = crypto.randomUUID()
          const dates = occurrences(date, rule)
          const { error } = await insertRows('videos', dates.map((d) => ({ client_id: clientId, title: title.trim(), status: 'todo', scheduled_date: d, scheduled_time: time || null, series_id, created_by: user?.id ?? null })))
          if (error) throw error
          toast(`${dates.length} Videos angelegt ✓`)
          navigate(`/client/${clientId}`)
          setOpen(false)
          return
        }
        const { error } = await supabase.from('videos').insert({ client_id: clientId, title: title.trim(), status: 'todo', scheduled_date: date || null, scheduled_time: time || null, created_by: user?.id ?? null })
        if (error) throw error
        toast('Video angelegt ✓')
        navigate(`/client/${clientId}`)
      }
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!open) return null

  const sumViews = lookup && (lookup.instagram?.views == null && lookup.tiktok?.views == null)
    ? null
    : lookup ? (lookup.instagram?.views ?? 0) + (lookup.tiktok?.views ?? 0) : null

  return (
    <Modal title="⚡ Schnell erfassen" onClose={() => setOpen(false)}>
      <div className="stack">
        <div className="seg voice-typeseg">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`seg-btn ${type === t.key ? 'on' : ''}`} onClick={() => setType(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {error && <div className="error-box">{error}</div>}

        {type === 'backfill' ? (
          <>
            {!lookup ? (
              <>
                <div className="info-box" style={{ fontSize: 13 }}>
                  Instagram- und/oder TikTok-Link eines bereits geposteten Videos einfügen — Titel-Vorschlag, Kunde und Zahlen werden automatisch geholt.
                </div>
                <div>
                  <label>📸 Instagram-Link</label>
                  <input type="url" value={igUrl} onChange={(e) => setIgUrl(e.target.value)} autoFocus placeholder="https://www.instagram.com/reel/…" onKeyDown={(e) => e.key === 'Enter' && runLookup()} />
                </div>
                <div>
                  <label>🎵 TikTok-Link</label>
                  <input type="url" value={ttUrl} onChange={(e) => setTtUrl(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" onKeyDown={(e) => e.key === 'Enter' && runLookup()} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
                  <button type="button" className="btn btn-primary" onClick={runLookup} disabled={lookupBusy}>
                    {lookupBusy ? 'Hole Daten …' : '🔍 Daten abrufen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="vc-stats">
                  {lookup.instagram && <span title="Instagram">📸 {fmtN(lookup.instagram.views)}</span>}
                  {lookup.tiktok && <span title="TikTok">🎵 {fmtN(lookup.tiktok.views)}</span>}
                  <span title="Gesamt"><strong>Σ {fmtN(sumViews)} Views</strong></span>
                </div>
                <div>
                  <label>Titel *</label>
                  <input value={bfTitle} onChange={(e) => setBfTitle(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
                </div>
                <div>
                  <label>Kunde *</label>
                  <select value={bfClientId} onChange={(e) => setBfClientId(e.target.value)}>
                    <option value="">— Kunde wählen —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {!bfClientId && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Kein Kunde automatisch erkannt — bitte auswählen.</p>}
                </div>
                <div>
                  <label>Postdatum</label>
                  <input type="date" value={bfDate} onChange={(e) => setBfDate(e.target.value)} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setLookup(null)}>← Neuer Link</button>
                  <div className="spacer" />
                  <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                    {busy ? 'Speichere …' : 'Video anlegen'}
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
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="z. B. Restaurant Sahin" onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
        ) : (
          <div>
            <label>{type === 'video' ? 'Video-Titel *' : 'Aufgabe *'}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={type === 'video' ? 'z. B. Pasta-Reel' : 'z. B. Sahin anrufen'} onKeyDown={(e) => e.key === 'Enter' && save()} />
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
            <select value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">— nichts —</option>
              {clients.length > 0 && <optgroup label="Kunden">{clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}</optgroup>}
              {leads.length > 0 && <optgroup label="Leads">{leads.map((l) => <option key={l.id} value={`lead:${l.id}`}>{l.name}</option>)}</optgroup>}
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
          {type === 'lead' && (
            <div style={{ flex: 1 }}>
              <label>Ort</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          )}
        </div>

        {(type === 'video' || type === 'task') && (
          <RepeatPicker value={rule} onChange={setRule} anchor={date} />
        )}

        {type === 'lead' && (
          <div>
            <label>Telefon</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
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
