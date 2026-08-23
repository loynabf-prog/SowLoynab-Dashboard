import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { AssigneePicker } from './Assignee'
import RepeatPicker from './RepeatPicker'
import { insertRows, updateRow } from '../lib/db'
import { occurrences, type RepeatRule } from '../lib/recurrence'
import { PRIORITIES } from '../lib/priority'
import { useCategories } from '../context/CategoryContext'
import type { TaskRow } from './TaskItem'

interface Option { id: string; name: string }

// Aufgabe anlegen/bearbeiten — geteilt von Startseite und Aufgabenseite.
export default function TaskModal({
  task,
  userId,
  clients,
  leads,
  defaults,
  onClose,
  onSaved,
}: {
  task: TaskRow | null
  userId: string | null
  clients: Option[]
  leads: Option[]
  defaults?: { due_date?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const { categories } = useCategories()
  const [title, setTitle] = useState(task?.title ?? '')
  const [due, setDue] = useState(task?.due_date ?? defaults?.due_date ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [category, setCategory] = useState<string | null>(task?.category ?? null)
  const [priority, setPriority] = useState<number>(task?.priority ?? 0)
  const [link, setLink] = useState(
    task?.client_id ? `client:${task.client_id}` : task?.lead_id ? `lead:${task.lead_id}` : '',
  )
  const [assignees, setAssignees] = useState<string[]>(task?.assignee_ids ?? [])
  const [repeat, setRepeat] = useState<RepeatRule>({ kind: 'none' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const client_id = link.startsWith('client:') ? link.slice(7) : null
    const lead_id = link.startsWith('lead:') ? link.slice(5) : null
    const base = {
      title: title.trim(),
      notes: notes.trim() || null,
      client_id,
      lead_id,
      category: category || null,
      priority,
      ...(assignees.length ? { assignee_ids: assignees } : {}),
    }

    // Wiederkehrend (nur beim Neuanlegen): mehrere Aufgaben als Serie
    if (!task && repeat.kind !== 'none') {
      if (!due) { setError('Für eine Wiederholung bitte oben „Fällig am" als Startdatum setzen.'); return }
      const dates = occurrences(due, repeat)
      if (dates.length === 0) { setError('Diese Wiederholung ergibt keine Termine.'); return }
      const series_id = crypto.randomUUID()
      setBusy(true); setError(null)
      const rows = dates.map((d) => ({ ...base, due_date: d, series_id, created_by: userId }))
      const res = await insertRows('tasks', rows)
      setBusy(false)
      if (res.error) setError(res.error.message)
      else onSaved()
      return
    }

    setBusy(true); setError(null)
    const payload = { ...base, due_date: due || null }
    const res = task
      ? await updateRow('tasks', payload, 'id', task.id)
      : await insertRows('tasks', [{ ...payload, created_by: userId }])
    setBusy(false)
    if (res.error) setError(res.error.message)
    else onSaved()
  }

  async function deleteSeries() {
    if (!task?.series_id) return
    if (!confirm('Die ganze Serie (alle noch offenen Termine dieser Wiederholung) in den Papierkorb legen?')) return
    setBusy(true)
    const res = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('series_id', task.series_id).is('deleted_at', null)
    setBusy(false)
    if (res.error) setError(res.error.message)
    else onSaved()
  }

  return (
    <Modal title={task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <div className="error-box">{error}</div>}
        <div>
          <label>Aufgabe *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required placeholder="z. B. Restaurant Sahin anrufen" />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Fällig am</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Verknüpfen mit</label>
            <select value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">— nichts —</option>
              {clients.length > 0 && (
                <optgroup label="Kunden">
                  {clients.map((c) => (
                    <option key={c.id} value={`client:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {leads.length > 0 && (
                <optgroup label="Leads">
                  {leads.map((l) => (
                    <option key={l.id} value={`lead:${l.id}`}>{l.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
        <div>
          <label>Dringlichkeit</label>
          <div className="cat-chips">
            <button type="button" className={`cat-chip ${!priority ? 'on' : ''}`} onClick={() => setPriority(0)}>
              <span className="cat-swatch" style={{ background: 'var(--border-strong)' }} />Ohne
            </button>
            {PRIORITIES.map((p) => (
              <button type="button" key={p.value} className={`cat-chip ${priority === p.value ? 'on' : ''}`} onClick={() => setPriority(p.value)}>
                <span className="cat-swatch" style={{ background: p.color }} />{p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Zuständig</label>
          <AssigneePicker value={assignees} onChange={setAssignees} />
        </div>
        {categories.length > 0 && (
          <div>
            <label>Kategorie <span className="muted">(Farbe im Kalender)</span></label>
            <div className="cat-chips">
              <button type="button" className={`cat-chip ${!category ? 'on' : ''}`} onClick={() => setCategory(null)}>
                <span className="cat-swatch" style={{ background: 'var(--border-strong)' }} />Keine
              </button>
              {categories.map((c) => (
                <button type="button" key={c.id} className={`cat-chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
                  <span className="cat-swatch" style={{ background: c.color }} />{c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label>Notizen</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {!task && <RepeatPicker value={repeat} onChange={setRepeat} anchor={due} />}
        {task?.series_id && (
          <div className="info-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>🔁 Teil einer Serie.</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={deleteSeries} disabled={busy}>Ganze Serie löschen</button>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? 'Speichere …' : task ? 'Speichern' : repeat.kind !== 'none' ? 'Serie anlegen' : 'Anlegen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
