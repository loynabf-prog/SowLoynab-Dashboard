import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { occurrences, type RepeatRule } from '../lib/recurrence'
import { dbKlartext, insertRows } from '../lib/db'
import { detectPlatform, klartext, lookupVideo, readFnError, type LookupResult, type PlatformResult } from '../lib/apify'
import RepeatPicker from './RepeatPicker'
import Modal from './Modal'

type QType = 'task' | 'lead' | 'video' | 'backfill' | 'inspiration'
interface Opt { id: string; name: string; handle_ig?: string | null; handle_tiktok?: string | null }

const TABS: { key: QType; label: string; icon: string }[] = [
  { key: 'task', label: 'Aufgabe', icon: '✓' },
  { key: 'lead', label: 'Lead', icon: '🎯' },
  { key: 'video', label: 'Video', icon: '🎬' },
  { key: 'backfill', label: 'Nachtragen', icon: '🔗' },
  { key: 'inspiration', label: 'Inspiration', icon: '🔖' },
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
  const [lookupWarn, setLookupWarn] = useState<string | null>(null)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [bfTitle, setBfTitle] = useState('')
  const [bfClientId, setBfClientId] = useState('')
  const [bfDate, setBfDate] = useState('')

  // Inspiration (fremdes Video als Vorbild merken)
  const [inspUrl, setInspUrl] = useState('')
  const [inspClientId, setInspClientId] = useState('')
  const [inspNotes, setInspNotes] = useState('')
  // Vorbelegter Kunde, wenn das Fenster von einer Kundenseite aus geoeffnet
  // wird. Als Ref, weil der Zuruecksetz-Effekt beim Oeffnen sonst schneller
  // waere als das Setzen -- der Kunde waere dann wieder weg.
  const pendingClient = useRef<string | null>(null)

  useEffect(() => {
    function openEvt(e: Event) {
      const detail = (e as CustomEvent).detail ?? {}
      const t = detail.type as QType | undefined
      if (t) setType(t)
      const c = detail.clientId as string | undefined
      if (c) {
        pendingClient.current = c
        // Falls das Fenster schon offen ist, laeuft der Zuruecksetz-Effekt
        // nicht -- dann gilt das hier direkt.
        setClientId(c); setInspClientId(c); setBfClientId(c)
      }
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
    if (!open) { pendingClient.current = null; return }
    setError(null)
    // busy/lookupBusy mit zuruecksetzen: das Fenster wird nur aus- und wieder
    // eingeblendet, der Zustand ueberlebt sonst und der Knopf bliebe auf
    // "Speichere …" haengen.
    setBusy(false); setLookupBusy(false)
    setTitle(''); setName(''); setClientId(''); setLink(''); setDate(''); setTime(''); setCity(''); setPhone(''); setRule({ kind: 'none' })
    setTtUrl(''); setIgUrl(''); setLookup(null); setLookupWarn(null); setLookupFailed(false); setBfTitle(''); setBfClientId(''); setBfDate('')
    setInspUrl(''); setInspClientId(''); setInspNotes('')
    // Von der Kundenseite aus geoeffnet: Kunde nach dem Zuruecksetzen wieder rein
    const vorbelegt = pendingClient.current
    if (vorbelegt) { setClientId(vorbelegt); setInspClientId(vorbelegt); setBfClientId(vorbelegt) }
    supabase.from('clients').select('id, name, handle_ig, handle_tiktok').is('deleted_at', null).order('name').then(({ data }) => setClients((data ?? []) as Opt[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setLeads((data ?? []) as Opt[]))
  }, [open])

  async function runLookup() {
    if (!igUrl.trim() && !ttUrl.trim()) { setError('Bitte mindestens einen Link einfügen.'); return }
    setLookupBusy(true)
    setError(null)
    setLookupFailed(false)
    try {
      const { data, error } = await supabase.functions.invoke('apify-lookup', {
        body: { instagram_url: igUrl.trim() || null, tiktok_url: ttUrl.trim() || null },
      })
      if (error) throw new Error(await readFnError(error))
      if (data?.error) throw new Error(data.error)
      const res = data as LookupResult
      setLookup(res)
      // Teil-Fehlschlag sichtbar machen — auch wenn die Plattform zwar
      // geantwortet hat, aber keine Aufrufzahl dabei war.
      const fehlt: string[] = []
      const details: string[] = []
      if (ttUrl.trim() && (!res.tiktok || res.tiktok.views == null)) {
        fehlt.push('TikTok')
        if (res.tiktok?.debug?.length) details.push(`TikTok lieferte: ${res.tiktok.debug.join(', ')}`)
      }
      if (igUrl.trim() && (!res.instagram || res.instagram.views == null)) {
        fehlt.push('Instagram')
        if (res.instagram?.debug?.length) details.push(`Instagram lieferte: ${res.instagram.debug.join(', ')}`)
      }
      const grund = [...(res.errors ?? []), ...details].join(' · ')
      setLookupWarn(
        fehlt.length
          ? `Von ${fehlt.join(' und ')} kam keine Aufrufzahl. ${grund || 'Kein Grund gemeldet.'}`
          : null,
      )
      const handle = res.instagram?.username || res.tiktok?.username || null
      setBfClientId(matchClientByHandle(handle, clients))
      const caption = res.instagram?.caption || res.tiktok?.caption || ''
      setBfTitle(caption ? (caption.length > 70 ? caption.slice(0, 70) + '…' : caption) : '')
      const postedAt = res.instagram?.postedAt || res.tiktok?.postedAt || null
      setBfDate(postedAt ? new Date(postedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    } catch (e) {
      setError(klartext((e as Error).message))
      setLookupFailed(true)
    } finally {
      setLookupBusy(false)
    }
  }

  // Abruf fehlgeschlagen (z. B. Video nicht oeffentlich): trotzdem anlegen
  // koennen. Links werden gespeichert, der Nachtjob versucht es spaeter neu.
  function skipLookup() {
    setError(null)
    setLookup({ tiktok: null, instagram: null })
    setLookupWarn('Ohne Zahlen angelegt — die Links sind gespeichert, die Zahlen kannst du beim Video von Hand eintragen.')
    setLookupFailed(false)
    setBfTitle('')
    setBfClientId('')
    setBfDate(new Date().toISOString().slice(0, 10))
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
      } else if (type === 'inspiration') {
        const url = inspUrl.trim()
        if (!url) { setError('Bitte den Link zum Video einfügen.'); setBusy(false); return }
        const platform = detectPlatform(url)
        if (platform === 'other') {
          setError('Das sieht nicht nach einem TikTok- oder Instagram-Link aus. Bitte den Link aus der App kopieren.')
          setBusy(false); return
        }
        // Zahlen holen -- schlaegt das fehl, wird die Inspiration trotzdem
        // gespeichert. Der Link ist das Wichtige, die Zahlen sind Beiwerk.
        let hit: PlatformResult | null = null
        let abrufFehler: string | null = null
        try {
          const res: LookupResult = await lookupVideo(
            platform === 'tiktok' ? { tiktok_url: url } : { instagram_url: url },
          )
          hit = platform === 'tiktok' ? res.tiktok : res.instagram
          if (!hit) abrufFehler = klartext((res.errors ?? []).join(' · ') || 'Kein Ergebnis für diesen Link.')
        } catch (e) {
          abrufFehler = (e as Error).message
        }
        const int = (n?: number | null) => (n == null || isNaN(n) ? null : Math.round(n))
        const caption = (hit?.caption ?? '').trim()
        const { error } = await insertRows('inspirations', [{
          client_id: inspClientId || null,
          url,
          platform,
          title: caption ? (caption.length > 90 ? caption.slice(0, 90) + '…' : caption) : null,
          author: hit?.username ?? null,
          thumbnail_url: hit?.thumbnail ?? null,
          notes: inspNotes.trim() || null,
          views: int(hit?.views), likes: int(hit?.likes), comments: int(hit?.comments),
          shares: int(hit?.shares), saves: int(hit?.saves),
          duration_seconds: int(hit?.duration),
          posted_at: hit?.postedAt ?? null,
          stats_updated_at: hit ? new Date().toISOString() : null,
          created_by: user?.id ?? null,
        }])
        if (error) throw error
        toast(abrufFehler ? 'Inspiration gemerkt — ohne Zahlen' : 'Inspiration gemerkt 🔖')
        navigate(inspClientId ? `/client/${inspClientId}?tab=inspiration` : '/inspirationen')
      } else if (type === 'backfill') {
        if (!lookup) { setError('Bitte zuerst die Daten abrufen.'); setBusy(false); return }
        // lookup kann bewusst leer sein (siehe skipLookup) — dann ohne Zahlen anlegen
        if (!bfClientId) { setError('Bitte einen Kunden auswählen.'); setBusy(false); return }
        if (!bfTitle.trim()) { setError('Bitte einen Titel angeben.'); setBusy(false); return }
        const tt = lookup.tiktok
        const ig = lookup.instagram
        // Alle Zahlen-Spalten sind Ganzzahlen. Apify liefert teils Kommazahlen
        // (z. B. Videolänge 34.7356 s) — ungerundet lehnt die Datenbank das
        // Speichern ab ("invalid input syntax for type integer").
        const int = (n?: number | null) => (n == null || isNaN(n) ? null : Math.round(n))
        const sum2 = (a?: number | null, b?: number | null) => (a == null && b == null ? null : Math.round((a ?? 0) + (b ?? 0)))
        const { error } = await insertRows('videos', [{
          client_id: bfClientId,
          title: bfTitle.trim(),
          status: 'posted',
          posted_at: bfDate ? new Date(bfDate + 'T12:00:00').toISOString() : new Date().toISOString(),
          tiktok_url: ttUrl.trim() || null,
          instagram_url: igUrl.trim() || null,
          duration_seconds: int(tt?.duration ?? ig?.duration),
          views: sum2(tt?.views, ig?.views),
          likes: sum2(tt?.likes, ig?.likes),
          comments: sum2(tt?.comments, ig?.comments),
          shares: sum2(tt?.shares, ig?.shares),
          saves: sum2(tt?.saves, ig?.saves),
          reach: sum2(tt?.views, ig?.views),
          views_ig: int(ig?.views), likes_ig: int(ig?.likes), comments_ig: int(ig?.comments), shares_ig: int(ig?.shares), saves_ig: int(ig?.saves),
          views_tiktok: int(tt?.views), likes_tiktok: int(tt?.likes), comments_tiktok: int(tt?.comments), shares_tiktok: int(tt?.shares), saves_tiktok: int(tt?.saves),
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
      setError(dbKlartext((e as Error).message))
    } finally {
      // Muss auf JEDEM Weg zurueck — auch bei Erfolg und bei den fruehen
      // return-Zweigen. Sonst bleibt der Knopf beim naechsten Oeffnen
      // dauerhaft auf "Speichere …".
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

        {type === 'inspiration' ? (
          <>
            <div className="info-box" style={{ fontSize: 13 }}>
              🔖 Ein fremdes Video, das ihr so ähnlich machen wollt. Link aus TikTok oder
              Instagram einfügen — Titel und Zahlen holen wir automatisch dazu.
            </div>
            <div>
              <label>Video-Link *</label>
              <input
                type="url"
                value={inspUrl}
                onChange={(e) => setInspUrl(e.target.value)}
                autoFocus
                placeholder="https://www.tiktok.com/@… oder https://www.instagram.com/reel/…"
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </div>
            <div>
              <label>Für welchen Kunden?</label>
              <select value={inspClientId} onChange={(e) => setInspClientId(e.target.value)}>
                <option value="">— allgemein, ohne Kunde —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Ohne Kunde landet die Inspiration in der allgemeinen Spalte unter „Inspirationen“.
              </p>
            </div>
            <div>
              <label>Notiz <span className="muted">(was gefällt euch daran?)</span></label>
              <textarea rows={2} value={inspNotes} onChange={(e) => setInspNotes(e.target.value)} placeholder="z. B. Schnitt auf den Beat, Text-Overlay in der ersten Sekunde" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Hole Daten …' : '🔖 Merken'}
              </button>
            </div>
          </>
        ) : type === 'backfill' ? (
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
                {lookupFailed && (
                  <div className="info-box" style={{ fontSize: 13 }}>
                    Du kannst das Video trotzdem anlegen — die Links werden gespeichert und die
                    nächtliche Aktualisierung versucht es später erneut. Die Zahlen kannst du beim
                    Video jederzeit von Hand eintragen.
                    <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={skipLookup}>
                      Trotzdem anlegen — ohne Zahlen
                    </button>
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
                  <button type="button" className="btn btn-primary" onClick={runLookup} disabled={lookupBusy}>
                    {lookupBusy ? 'Hole Daten …' : '🔍 Daten abrufen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {lookupWarn && <div className="warn-box">⚠ {lookupWarn}</div>}
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
