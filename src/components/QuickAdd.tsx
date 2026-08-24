import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { occurrences, type RepeatRule } from '../lib/recurrence'
import { insertRows } from '../lib/db'
import RepeatPicker from './RepeatPicker'
import Modal from './Modal'

type QType = 'task' | 'lead' | 'video'
interface Opt { id: string; name: string }

const TABS: { key: QType; label: string; icon: string }[] = [
  { key: 'task', label: 'Aufgabe', icon: '✓' },
  { key: 'lead', label: 'Lead', icon: '🎯' },
  { key: 'video', label: 'Video', icon: '🎬' },
]

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
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setClients((data ?? []) as Opt[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setLeads((data ?? []) as Opt[]))
  }, [open])

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
      </div>
    </Modal>
  )
}
