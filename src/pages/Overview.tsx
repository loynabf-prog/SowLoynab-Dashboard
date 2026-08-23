import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dateRelative } from '../lib/format'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import SwipeRow from '../components/SwipeRow'
import TaskItem, { type TaskRow } from '../components/TaskItem'
import TaskModal from '../components/TaskModal'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

interface PostLite { id: string; title: string; scheduled_date: string; client_id: string; clients?: { name: string } | null }
interface Option { id: string; name: string }

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Overview() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [posts, setPosts] = useState<PostLite[]>([])
  const [loading, setLoading] = useState(true)
  const [clientOpts, setClientOpts] = useState<Option[]>([])
  const [leadOpts, setLeadOpts] = useState<Option[]>([])
  const [editing, setEditing] = useState<TaskRow | null>(null)

  // Nur die fälligen Aufgaben nachladen (nach Speichern/Löschen)
  const reloadTasks = useCallback(async () => {
    const today = iso(new Date())
    const { data } = await supabase
      .from('tasks')
      .select('*, clients(name), leads(name)')
      .eq('done', false)
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .lte('due_date', today)
      .order('due_date', { ascending: true })
    setTasks((data ?? []) as unknown as TaskRow[])
  }, [])

  useEffect(() => {
    async function load() {
      const today = new Date()
      const in7 = new Date()
      in7.setDate(in7.getDate() + 7)

      const [tasksRes, postsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, clients(name), leads(name)')
          .eq('done', false)
          .is('deleted_at', null)
          .not('due_date', 'is', null)
          .lte('due_date', iso(today))
          .order('due_date', { ascending: true }),
        supabase
          .from('videos')
          .select('id, title, scheduled_date, client_id, status, clients(name)')
          .neq('status', 'posted')
          .is('deleted_at', null)
          .not('scheduled_date', 'is', null)
          .gte('scheduled_date', iso(today))
          .lte('scheduled_date', iso(in7))
          .order('scheduled_date', { ascending: true }),
      ])

      setTasks((tasksRes.data ?? []) as unknown as TaskRow[])
      setPosts((postsRes.data ?? []) as unknown as PostLite[])
      setLoading(false)
    }
    load()
    // Kunden/Leads für den Aufgaben-Editor
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setClientOpts((data ?? []) as Option[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setLeadOpts((data ?? []) as Option[]))
  }, [])

  async function completeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').update({ done: true }).eq('id', id)
    toast('Erledigt ✓')
  }

  async function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => { await supabase.from('tasks').update({ deleted_at: null }).eq('id', id); reloadTasks() },
    })
  }

  async function markPosted(p: PostLite) {
    setPosts((prev) => prev.filter((x) => x.id !== p.id))
    celebrate()
    await supabase.from('videos').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', p.id)
    toast('Gepostet — stark! 🎉')
  }

  const firstName = (user?.email ?? '').split('@')[0].split('.')[0]
  const todayIso = iso(new Date())
  const postsToday = posts.filter((p) => p.scheduled_date === todayIso).length
  const dringend = tasks.filter((t) => (t.priority ?? 0) === 3).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}{firstName ? `, ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}` : ''} 👋</h1>
          <span className="sub">{loading ? 'Lade …' : 'Dein Cockpit — heute im Fokus'}</span>
        </div>
      </div>

      <div className="today-strip">
        <span><strong>{tasks.length}</strong> {tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} offen</span>
        <span><strong>{postsToday}</strong> {postsToday === 1 ? 'Post' : 'Posts'} heute</span>
        {dringend > 0 && <span className="hot"><strong>{dringend}</strong> dringend</span>}
      </div>

      <div className="overview-cols">
        <div className="section-block">
          <h2 className="section-title">Heute &amp; überfällig</h2>
          {tasks.length === 0 ? (
            <div className="col-empty">Nichts fällig. 🎉</div>
          ) : (
            <div className="task-list">
              {tasks.map((t) => (
                <SwipeRow key={t.id} onDelete={() => removeTask(t.id)}>
                  <TaskItem t={t} onToggle={() => completeTask(t.id)} onEdit={() => setEditing(t)} onDelete={() => removeTask(t.id)} />
                </SwipeRow>
              ))}
            </div>
          )}
        </div>

        <div className="section-block">
          <h2 className="section-title">Anstehende Posts (7 Tage)</h2>
          {posts.length === 0 ? (
            <div className="col-empty">Keine geplanten Posts.</div>
          ) : (
            <div className="task-list">
              {posts.map((p) => {
                const when = dateRelative(p.scheduled_date)
                return (
                  <div key={p.id} className="task-item">
                    <span className="activity-icon" style={{ cursor: 'pointer' }} onClick={() => navigate(`/client/${p.client_id}`)}>🎬</span>
                    <div className="task-body" style={{ cursor: 'pointer' }} onClick={() => navigate(`/client/${p.client_id}`)}>
                      <div className="task-title">{p.title}</div>
                      <div className="task-meta">
                        <span className={`task-due ${when.soon ? 'soon' : ''}`}>📅 {when.text}</span>
                        {p.clients?.name && <span className="chip">{p.clients.name}</span>}
                      </div>
                    </div>
                    <button className="btn btn-sm" onClick={() => markPosted(p)} title="Als gepostet markieren">✓ Gepostet</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <TaskModal
          task={editing}
          userId={user?.id ?? null}
          clients={clientOpts}
          leads={leadOpts}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadTasks(); toast('Gespeichert ✓') }}
        />
      )}
    </>
  )
}
