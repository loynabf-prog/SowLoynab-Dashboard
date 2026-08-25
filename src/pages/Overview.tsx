import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import SwipeRow from '../components/SwipeRow'
import TaskItem, { type TaskRow } from '../components/TaskItem'
import TaskModal from '../components/TaskModal'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

interface PostLite {
  id: string
  title: string
  scheduled_date: string
  scheduled_time: string | null
  client_id: string
  clients?: { name: string } | null
}
interface Option { id: string; name: string }

// Ein Eintrag im Tagesplan — Aufgabe mit Uhrzeit oder Video mit Post-Zeit.
interface PlanEntry {
  key: string
  time: string
  title: string
  sub: string | null
  kind: 'task' | 'post'
  onOpen: () => void
}

const hhmm = (t: string) => t.slice(0, 5)

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return iso(d)
}

export default function Overview() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [posts, setPosts] = useState<PostLite[]>([])
  const [loading, setLoading] = useState(true)
  const [clientOpts, setClientOpts] = useState<Option[]>([])
  const [leadOpts, setLeadOpts] = useState<Option[]>([])
  const [editing, setEditing] = useState<TaskRow | null>(null)
  // Feierabend-Blick: zwischen heute und morgen umschalten
  const [day, setDay] = useState<'today' | 'tomorrow'>('today')

  // Nur die fälligen Aufgaben nachladen (nach Speichern/Löschen)
  const reloadTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, clients(name), leads(name)')
      .eq('done', false)
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .lte('due_date', tomorrowIso())
      .order('due_date', { ascending: true })
    setTasks((data ?? []) as unknown as TaskRow[])
  }, [])

  useEffect(() => {
    async function load() {
      // Heute UND morgen in einem Rutsch holen, damit das Umschalten
      // ohne Nachladen sofort reagiert.
      const bis = tomorrowIso()

      const [tasksRes, postsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, clients(name), leads(name)')
          .eq('done', false)
          .is('deleted_at', null)
          .not('due_date', 'is', null)
          .lte('due_date', bis)
          .order('due_date', { ascending: true }),
        // Uploads von heute und morgen — mehr Vorausblick gibt es hier nicht
        supabase
          .from('videos')
          .select('*, clients(name)')
          .neq('status', 'posted')
          .is('deleted_at', null)
          .in('scheduled_date', [iso(new Date()), bis])
          .order('scheduled_time', { ascending: true, nullsFirst: false }),
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

  // Mit dem echten Namen der aktiven Identität grüßen (Fassie / Lion), nicht dem Mail-Namen
  const meName = ((memberId ? byId(memberId)?.name : '') ?? '').trim().split(' ')[0]
  const todayIso = iso(new Date())
  const morgen = day === 'tomorrow'
  const tagIso = morgen ? tomorrowIso() : todayIso

  // Heute: alles bis einschliesslich heute (Liegengebliebenes bleibt sichtbar).
  // Morgen: ausschliesslich der morgige Tag — Vorschau, keine Altlasten.
  const tagTasks = morgen
    ? tasks.filter((t) => t.due_date === tagIso)
    : tasks.filter((t) => (t.due_date ?? '') <= todayIso)
  const tagPosts = posts.filter((p) => p.scheduled_date === tagIso)

  const dringend = tagTasks.filter((t) => (t.priority ?? 0) === 3).length
  const overdue = morgen ? [] : tagTasks.filter((t) => (t.due_date ?? '') < todayIso)

  // Tagesplan: alles mit fester Uhrzeit am gewaehlten Tag, chronologisch
  const plan: PlanEntry[] = [
    ...tagTasks
      .filter((t) => t.due_time)
      .map((t) => ({
        key: `t-${t.id}`,
        time: hhmm(t.due_time as string),
        title: t.title,
        sub: t.clients?.name ?? t.leads?.name ?? null,
        kind: 'task' as const,
        onOpen: () => setEditing(t),
      })),
    ...tagPosts
      .filter((p) => p.scheduled_time)
      .map((p) => ({
        key: `p-${p.id}`,
        time: hhmm(p.scheduled_time as string),
        title: p.title,
        sub: p.clients?.name ?? null,
        kind: 'post' as const,
        onOpen: () => navigate(`/client/${p.client_id}`),
      })),
  ].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{morgen ? 'Blick auf morgen 🌙' : `${greeting()}${meName ? `, ${meName}` : ''} 👋`}</h1>
          <span className="sub">
            {loading
              ? 'Lade …'
              : morgen
                ? `Was ${new Date(tagIso + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long' })} ansteht — in Ruhe vorbereiten`
                : 'Dein Cockpit — heute im Fokus'}
          </span>
        </div>
        <div className="spacer" />
        <button
          className={`btn btn-sm peek-btn ${morgen ? 'on' : ''}`}
          onClick={() => setDay(morgen ? 'today' : 'tomorrow')}
          title={morgen ? 'Zurück zu heute' : 'Blick auf morgen'}
        >
          {morgen ? '← Heute' : 'Morgen →'}
        </button>
      </div>

      <div className="today-strip">
        <span><strong>{tagTasks.length}</strong> {tagTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} {morgen ? 'morgen' : 'offen'}</span>
        <span><strong>{tagPosts.length}</strong> {tagPosts.length === 1 ? 'Upload' : 'Uploads'} {morgen ? 'morgen' : 'heute'}</span>
        {plan.length > 0 && <span><strong>{plan.length}</strong> {plan.length === 1 ? 'Termin' : 'Termine'}</span>}
        {dringend > 0 && <span className="hot"><strong>{dringend}</strong> dringend</span>}
        {overdue.length > 0 && <span className="hot"><strong>{overdue.length}</strong> überfällig</span>}
      </div>

      {/* Tagesplan — nur wenn heute wirklich etwas zu einer Uhrzeit ansteht */}
      {plan.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">{morgen ? 'Morgen nach Uhrzeit' : 'Heute nach Uhrzeit'}</h2>
          <div className="dayplan">
            {plan.map((e) => (
              <button className="dayplan-row" key={e.key} onClick={e.onOpen}>
                <span className="dayplan-time">{e.time}</span>
                <span className={`dayplan-dot ${e.kind}`} />
                <span className="dayplan-main">
                  <span className="dayplan-title">{e.title}</span>
                  {e.sub && <span className="dayplan-sub">{e.sub}</span>}
                </span>
                <span className="dayplan-kind">{e.kind === 'post' ? '🎬' : '✓'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overview-cols">
        <div className="section-block">
          <h2 className="section-title">{morgen ? 'Aufgaben morgen' : 'Aufgaben heute'}</h2>
          {tagTasks.length === 0 ? (
            <div className="col-empty">{morgen ? 'Morgen ist nichts fällig. 🌙' : 'Nichts fällig. 🎉'}</div>
          ) : (
            <div className="task-list">
              {tagTasks.map((t) => (
                <SwipeRow key={t.id} onDelete={() => removeTask(t.id)}>
                  <TaskItem t={t} onToggle={() => completeTask(t.id)} onEdit={() => setEditing(t)} onDelete={() => removeTask(t.id)} />
                </SwipeRow>
              ))}
            </div>
          )}
        </div>

        <div className="section-block">
          <h2 className="section-title">{morgen ? 'Video-Uploads morgen' : 'Video-Uploads heute'}</h2>
          {tagPosts.length === 0 ? (
            <div className="col-empty">{morgen ? 'Morgen kein Upload geplant.' : 'Heute kein Upload geplant.'}</div>
          ) : (
            <div className="task-list">
              {tagPosts.map((p) => (
                <div key={p.id} className="task-item">
                  <span className="activity-icon" style={{ cursor: 'pointer' }} onClick={() => navigate(`/client/${p.client_id}`)}>🎬</span>
                  <div className="task-body" style={{ cursor: 'pointer' }} onClick={() => navigate(`/client/${p.client_id}`)}>
                    <div className="task-title">{p.title}</div>
                    <div className="task-meta">
                      {p.scheduled_time
                        ? <span className="task-time">⏰ {hhmm(p.scheduled_time)} Uhr</span>
                        : <span className="task-due">📅 {morgen ? 'morgen' : 'heute'}</span>}
                      {p.clients?.name && <span className="chip">{p.clients.name}</span>}
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => markPosted(p)} title="Als gepostet markieren">✓ Gepostet</button>
                </div>
              ))}
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
