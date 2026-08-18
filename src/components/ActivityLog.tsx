import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Activity } from '../lib/types'

const KINDS: { value: string; label: string; icon: string }[] = [
  { value: 'note', label: 'Notiz', icon: '📝' },
  { value: 'call', label: 'Anruf', icon: '📞' },
  { value: 'email', label: 'E-Mail', icon: '✉️' },
  { value: 'meeting', label: 'Termin', icon: '🤝' },
]

function iconFor(kind: string) {
  return KINDS.find((k) => k.value === kind)?.icon ?? '📝'
}

interface Props {
  clientId?: string
  leadId?: string
}

export default function ActivityLog({ clientId, leadId }: Props) {
  const { user } = useAuth()
  const [items, setItems] = useState<Activity[]>([])
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('note')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    let q = supabase.from('activities').select('*').order('created_at', { ascending: false })
    q = clientId ? q.eq('client_id', clientId) : q.eq('lead_id', leadId!)
    const { data } = await q
    setItems((data ?? []) as Activity[])
  }, [clientId, leadId])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    const { error } = await supabase.from('activities').insert({
      kind,
      body: body.trim(),
      client_id: clientId ?? null,
      lead_id: leadId ?? null,
      created_by: user?.id ?? null,
    })
    setBusy(false)
    if (!error) {
      setBody('')
      setKind('note')
      load()
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('activities').delete().eq('id', id)
  }

  return (
    <div className="activity">
      <form className="activity-add" onSubmit={add}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="activity-kind">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.icon} {k.label}
            </option>
          ))}
        </select>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Was ist passiert? (z. B. angerufen, Angebot geschickt …)"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
          Eintragen
        </button>
      </form>

      {items.length === 0 ? (
        <div className="col-empty">Noch keine Einträge.</div>
      ) : (
        <div className="activity-list">
          {items.map((a) => (
            <div className="activity-item" key={a.id}>
              <span className="activity-icon">{iconFor(a.kind)}</span>
              <div className="activity-body">
                <div>{a.body}</div>
                <div className="activity-date">
                  {new Date(a.created_at).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              <button className="activity-del" onClick={() => remove(a.id)} title="loeschen">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
