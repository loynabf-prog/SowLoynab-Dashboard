import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SwipeRow from '../components/SwipeRow'
import TaskItem, { type TaskRow } from '../components/TaskItem'
import TaskModal from '../components/TaskModal'
import { useTeam } from '../context/TeamContext'
import { useIdentity } from '../context/IdentityContext'
import { useToast } from '../context/ToastContext'

interface Option { id: string; name: string }

export default function Tasks() {
  const { user } = useAuth()
  const { members } = useTeam()
  const { memberId } = useIdentity()
  const { toast } = useToast()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [leads, setLeads] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [q, setQ] = useState('')
  const [filterMember, setFilterMember] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(name), leads(name)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setTasks((data ?? []).filter((t: any) => !t.deleted_at) as TaskRow[])
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

  // Direktlink: /aufgaben?open=<id> öffnet die Aufgabe sofort
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || loading) return
    const t = tasks.find((x) => x.id === openId)
    if (t) {
      setEditing(t)
      searchParams.delete('open')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, loading, searchParams])

  async function toggle(t: TaskRow) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
    const { error } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id)
    if (error) load()
  }

  async function remove(id: string) {
    setTasks((prev) => prev.filter((x) => x.id !== id))
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      load()
      return
    }
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => {
        await supabase.from('tasks').update({ deleted_at: null }).eq('id', id)
        load()
      },
    })
  }

  const filtered = tasks.filter((t) => {
    if (filterMember && !(t.assignee_ids ?? []).includes(filterMember)) return false
    if (q.trim()) {
      const hay = [t.title, t.notes, t.clients?.name, t.leads?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })
  const open = filtered.filter((t) => !t.done)
  const done = filtered.filter((t) => t.done)

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

      <div className="toolbar-row">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Aufgabe suchen …"
        />
        <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)} className="filter-select">
          <option value="">Alle Zuständigen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {memberId && (
          <button
            className={`btn ${filterMember === memberId ? 'btn-primary' : ''}`}
            onClick={() => setFilterMember(filterMember === memberId ? '' : memberId)}
          >
            🙋 Nur meine
          </button>
        )}
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="task-list">
        {open.length === 0 && !loading && <div className="col-empty">Keine offenen Aufgaben. 🎉</div>}
        {open.map((t) => (
          <SwipeRow key={t.id} onDelete={() => remove(t.id)}>
            <TaskItem t={t} onToggle={() => toggle(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t.id)} />
          </SwipeRow>
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
                <SwipeRow key={t.id} onDelete={() => remove(t.id)}>
                  <TaskItem t={t} onToggle={() => toggle(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t.id)} />
                </SwipeRow>
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
            toast('Gespeichert ✓')
          }}
        />
      )}
    </>
  )
}
