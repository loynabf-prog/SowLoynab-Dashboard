import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { AssigneePicker } from './Assignee'
import type { TaskRow } from './TaskItem'

interface Option { id: string; name: string }

// Aufgabe anlegen/bearbeiten — geteilt von Startseite und Aufgabenseite.
export default function TaskModal({
  task,
  userId,
  clients,
  leads,
  onClose,
  onSaved,
}: {
  task: TaskRow | null
  userId: string | null
  clients: Option[]
  leads: Option[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [due, setDue] = useState(task?.due_date ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [link, setLink] = useState(
    task?.client_id ? `client:${task.client_id}` : task?.lead_id ? `lead:${task.lead_id}` : '',
  )
  const [assignees, setAssignees] = useState<string[]>(task?.assignee_ids ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    const client_id = link.startsWith('client:') ? link.slice(7) : null
    const lead_id = link.startsWith('lead:') ? link.slice(5) : null
    const payload = {
      title: title.trim(),
      due_date: due || null,
      notes: notes.trim() || null,
      client_id,
      lead_id,
      ...(assignees.length ? { assignee_ids: assignees } : {}),
    }
    const res = task
      ? await supabase.from('tasks').update(payload).eq('id', task.id)
      : await supabase.from('tasks').insert({ ...payload, created_by: userId })
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
          <label>Zuständig</label>
          <AssigneePicker value={assignees} onChange={setAssignees} />
        </div>
        <div>
          <label>Notizen</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? 'Speichere …' : task ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
