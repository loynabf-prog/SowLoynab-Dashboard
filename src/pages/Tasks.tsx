import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { dateRelative } from '../lib/format'
import type { Task } from '../lib/types'
import Modal from '../components/Modal'

interface TaskRow extends Task {
  clients?: { name: string } | null
  leads?: { name: string } | null
}

interface Option { id: string; name: string }

export default function Tasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [leads, setLeads] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [showDone, setShowDone] = useState(false)

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(name), leads(name)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setTasks((data ?? []) as TaskRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients((data ?? []) as Option[]))
    supabase.from('leads').select('id, name').order('name').then(({ data }) => setLeads((data ?? []) as Option[]))
    const ch = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(t: TaskRow) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
    const { error } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id)
    if (error) load()
  }

  async function remove(id: string) {
    setTasks((prev) => prev.filter((x) => x.id !== id))
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) load()
  }

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Aufgaben</h1>
          <span className="sub">{loading ? 'Lade …' : `${open.length} offen · ${done.length} erledigt`}</span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Aufgabe
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="task-list">
        {open.length === 0 && !loading && <div className="col-empty">Keine offenen Aufgaben. 🎉</div>}
        {open.map((t) => (
          <TaskItem key={t.id} t={t} onToggle={() => toggle(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t.id)} />
        ))}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowDone((s) => !s)}>
            {showDone ? '▾' : '▸'} Erledigt ({done.length})
          </button>
          {showDone && (
            <div className="task-list" style={{ marginTop: 12, opacity: 0.7 }}>
              {done.map((t) => (
                <TaskItem key={t.id} t={t} onToggle={() => toggle(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {(creating || editing) && (
        <TaskModal
          task={editing}
          userId={user?.id ?? null}
          clients={clients}
          leads={leads}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </>
  )
}

function TaskItem({
  t,
  onToggle,
  onEdit,
  onDelete,
}: {
  t: TaskRow
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const due = t.due_date ? dateRelative(t.due_date) : null
  const linked = t.clients?.name || t.leads?.name
  return (
    <div className="task-item">
      <button
        className={`task-check ${t.done ? 'on' : ''}`}
        onClick={onToggle}
        aria-label="erledigt umschalten"
      >
        {t.done ? '✓' : ''}
      </button>
      <div className="task-body" onClick={onEdit}>
        <div className={`task-title ${t.done ? 'strike' : ''}`}>{t.title}</div>
        <div className="task-meta">
          {due && (
            <span className={`task-due ${due.overdue ? 'overdue' : due.soon ? 'soon' : ''}`}>
              {due.overdue ? '⚠ ' : '📅 '}
              {due.text}
            </span>
          )}
          {linked && <span className="chip">{t.clients?.name ? '👤 ' : '🎯 '}{linked}</span>}
        </div>
      </div>
      <button className="btn btn-sm btn-danger" onClick={onDelete} title="loeschen">
        ✕
      </button>
    </div>
  )
}

function TaskModal({
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
  // "link" kodiert als "client:<id>" | "lead:<id>" | ""
  const [link, setLink] = useState(
    task?.client_id ? `client:${task.client_id}` : task?.lead_id ? `lead:${task.lead_id}` : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    const client_id = link.startsWith('client:') ? link.slice(7) : null
    const lead_id = link.startsWith('lead:') ? link.slice(5) : null
    const payload = { title: title.trim(), due_date: due || null, notes: notes.trim() || null, client_id, lead_id }
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
