import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { euro, dateRelative } from '../lib/format'
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
  const [openLeads, setOpenLeads] = useState(0)
  const [pipeline, setPipeline] = useState(0)
  const [mrr, setMrr] = useState(0)
  const [monthNet, setMonthNet] = useState(0)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [posts, setPosts] = useState<PostLite[]>([])
  const [postedMonth, setPostedMonth] = useState(0)
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
      const monthPrefix = iso(today).slice(0, 7)
      const monthStart = monthPrefix + '-01'

      const [leadsRes, clientsRes, txRes, tasksRes, postsRes, postedRes] = await Promise.all([
        supabase.from('leads').select('stage, potential_fee').is('deleted_at', null),
        supabase.from('clients').select('monthly_fee, active'),
        supabase.from('transactions').select('type, amount, occurred_on'),
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
        supabase.from('videos').select('id').is('deleted_at', null).gte('posted_at', monthStart),
      ])
      setPostedMonth(postedRes.data?.length ?? 0)

      const leads = (leadsRes.data ?? []) as any[]
      const open = leads.filter((l) => l.stage !== 'won' && l.stage !== 'lost')
      setOpenLeads(open.length)
      setPipeline(open.reduce((s, l) => s + (Number(l.potential_fee) || 0), 0))

      const clients = (clientsRes.data ?? []) as any[]
      setMrr(clients.filter((c) => c.active).reduce((s, c) => s + (Number(c.monthly_fee) || 0), 0))

      const tx = (txRes.data ?? []) as any[]
      const inc = tx.filter((t) => t.type === 'income' && String(t.occurred_on).startsWith(monthPrefix)).reduce((s, t) => s + Number(t.amount), 0)
      const exp = tx.filter((t) => t.type === 'expense' && String(t.occurred_on).startsWith(monthPrefix)).reduce((s, t) => s + Number(t.amount), 0)
      setMonthNet(inc - exp)

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}{firstName ? `, ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}` : ''} 👋</h1>
          <span className="sub">{loading ? 'Lade …' : 'Dein Cockpit — heute im Fokus'}</span>
        </div>
      </div>

      <div className="fin-tiles" style={{ marginBottom: 28 }}>
        <Link to="/leads" className="fin-tile" style={{ color: 'inherit' }}>
          <span className="fin-label">Offene Leads</span>
          <span className="fin-value">{openLeads}</span>
          <span className="fin-sub">{euro(pipeline)}/Mon. Potenzial</span>
        </Link>
        <Link to="/aufgaben" className="fin-tile" style={{ color: 'inherit' }}>
          <span className="fin-label">Fällige Aufgaben</span>
          <span className={`fin-value ${tasks.length > 0 ? 'expense' : ''}`}>{tasks.length}</span>
          <span className="fin-sub">heute &amp; überfällig</span>
        </Link>
        <Link to="/leistung" className="fin-tile" style={{ color: 'inherit' }}>
          <span className="fin-label">Posts diesen Monat</span>
          <span className="fin-value income">{postedMonth}</span>
          <span className="fin-sub">🎉 → Zahlen eintragen</span>
        </Link>
        <Link to="/finanzen" className="fin-tile" style={{ color: 'inherit' }}>
          <span className="fin-label">Einnahmen / Monat</span>
          <span className="fin-value income">{euro(mrr)}</span>
          <span className="fin-sub">aus aktiven Kunden</span>
        </Link>
        <Link to="/finanzen" className="fin-tile" style={{ color: 'inherit' }}>
          <span className="fin-label">Saldo diesen Monat</span>
          <span className={`fin-value ${monthNet >= 0 ? 'income' : 'expense'}`}>{euro(monthNet)}</span>
          <span className="fin-sub">Einnahmen − Ausgaben</span>
        </Link>
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
