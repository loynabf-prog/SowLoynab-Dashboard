import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import SwipeRow from '../components/SwipeRow'
import PostLinksModal from '../components/PostLinksModal'
import LinkQueue from '../components/LinkQueue'
import { seit } from '../lib/format'
import type { Video } from '../lib/types'
import { type TaskRow } from '../components/TaskItem'
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
type PostedVideo = Video & { clients?: { name: string } | null }

// Ein Eintrag im Tagesplan — Aufgabe mit Uhrzeit oder Video mit Post-Zeit.
interface PlanEntry {
  key: string
  time: string | null
  title: string
  sub: string | null
  kind: 'task' | 'post'
  dringend: boolean
  spaet: boolean
  task: TaskRow | null
  post: PostLite | null
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
  // Was heute rausging -- am selben Tag will man da noch dran: Adresse
  // nachtragen, Zahlen holen, zum Kunden springen.
  const [heuteRaus, setHeuteRaus] = useState<PostedVideo[]>([])
  const [links, setLinks] = useState<PostedVideo | null>(null)

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

  // Heute veroeffentlichte Videos. Tagesgrenzen bewusst lokal gerechnet --
  // posted_at liegt in UTC, ein Posting um 01:00 wuerde sonst auf gestern
  // fallen.
  const reloadHeuteRaus = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const ende = new Date(start); ende.setDate(ende.getDate() + 1)
    const { data } = await supabase
      .from('videos')
      .select('*, clients(name)')
      .eq('status', 'posted')
      .is('deleted_at', null)
      .gte('posted_at', start.toISOString())
      .lt('posted_at', ende.toISOString())
      .order('posted_at', { ascending: false })
    setHeuteRaus((data ?? []) as unknown as PostedVideo[])
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
    reloadHeuteRaus()
    // Kunden/Leads für den Aufgaben-Editor
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setClientOpts((data ?? []) as Option[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setLeadOpts((data ?? []) as Option[]))
  }, [reloadHeuteRaus])

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
    // taucht sofort unten unter "Heute rausgegangen" auf
    reloadHeuteRaus()
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

  // EINE Liste statt drei Bloecke. Alles, was heute ansteht — Aufgaben und
  // Uploads gemischt —, sortiert wie der Tag ablaeuft: erst was eine Uhrzeit
  // hat, danach der Rest. Der Kopf soll nicht entscheiden muessen, in welchem
  // Kasten er nachsehen muss.
  const jetzt: PlanEntry[] = [
    ...tagTasks.map((t) => ({
      key: `t-${t.id}`,
      time: t.due_time ? hhmm(t.due_time) : null,
      title: t.title,
      sub: t.clients?.name ?? t.leads?.name ?? null,
      kind: 'task' as const,
      dringend: (t.priority ?? 0) === 3,
      spaet: !morgen && (t.due_date ?? '') < todayIso,
      task: t,
      post: null,
    })),
    ...tagPosts.map((p) => ({
      key: `p-${p.id}`,
      time: p.scheduled_time ? hhmm(p.scheduled_time) : null,
      title: p.title,
      sub: p.clients?.name ?? null,
      kind: 'post' as const,
      dringend: false,
      spaet: false,
      task: null,
      post: p,
    })),
  ].sort((a, b) => {
    // Mit Uhrzeit zuerst, chronologisch; ohne Uhrzeit hinten dran
    if (a.time && b.time) return a.time.localeCompare(b.time)
    if (a.time) return -1
    if (b.time) return 1
    return 0
  })

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
        {!morgen && heuteRaus.length > 0 && <span className="good"><strong>{heuteRaus.length}</strong> raus</span>}
        {dringend > 0 && <span className="hot"><strong>{dringend}</strong> dringend</span>}
        {overdue.length > 0 && <span className="hot"><strong>{overdue.length}</strong> überfällig</span>}
      </div>

      {/* Eine einzige Liste: was heute dran ist. Erst mit Uhrzeit, dann der
          Rest. Aufgaben und Uploads gemischt — so wie der Tag auch laeuft. */}
      <div className="section-block">
        <h2 className="section-title">{morgen ? 'Morgen dran' : 'Jetzt dran'}</h2>
        {jetzt.length === 0 ? (
          <div className="col-empty" style={{ padding: 26 }}>
            {morgen ? 'Morgen ist noch nichts geplant. 🌙' : 'Alles erledigt. Genieß den Tag. 🎉'}
          </div>
        ) : (
          <div className="jetzt-liste">
            {jetzt.map((e) => (
              e.task ? (
                <SwipeRow key={e.key} onDelete={() => removeTask(e.task!.id)}>
                  <div className={`jetzt-row ${e.spaet ? 'spaet' : ''}`}>
                    <button
                      className="jetzt-check"
                      onClick={() => completeTask(e.task!.id)}
                      title="Erledigt"
                      aria-label="Als erledigt abhaken"
                    />
                    <button className="jetzt-main" onClick={() => setEditing(e.task)}>
                      <span className="jetzt-title">{e.title}</span>
                      <span className="jetzt-meta">
                        {e.time && <span className="jetzt-zeit">{e.time}</span>}
                        {e.spaet && <span className="jetzt-spaet">überfällig</span>}
                        {e.dringend && <span className="jetzt-hot">dringend</span>}
                        {e.sub && <span className="chip">{e.sub}</span>}
                      </span>
                    </button>
                  </div>
                </SwipeRow>
              ) : (
                <div className="jetzt-row" key={e.key}>
                  <span className="jetzt-ic">🎬</span>
                  <button className="jetzt-main" onClick={() => navigate(`/client/${e.post!.client_id}`)}>
                    <span className="jetzt-title">{e.title}</span>
                    <span className="jetzt-meta">
                      {e.time && <span className="jetzt-zeit">{e.time}</span>}
                      <span className="jetzt-art">posten</span>
                      {e.sub && <span className="chip">{e.sub}</span>}
                    </span>
                  </button>
                  <button className="btn btn-sm" onClick={() => markPosted(e.post!)} title="Als gepostet markieren">
                    ✓ Gepostet
                  </button>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {!morgen && <LinkQueue />}

      {/* Was heute schon rausging. Nur im Heute-Blick -- morgen ist noch
          nichts gepostet, da waere der Abschnitt sinnlos. */}
      {!morgen && heuteRaus.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">Heute rausgegangen 🚀</h2>
          <div className="task-list">
            {heuteRaus.map((v) => {
              const ohneLink = !v.tiktok_url && !v.instagram_url
              return (
                <div key={v.id} className="task-item">
                  <span className="activity-icon" style={{ cursor: 'pointer' }} onClick={() => navigate(`/client/${v.client_id}`)}>✅</span>
                  <div className="task-body" style={{ cursor: 'pointer' }} onClick={() => navigate(`/client/${v.client_id}`)}>
                    <div className="task-title">{v.title}</div>
                    <div className="task-meta">
                      {v.clients?.name && <span className="chip">{v.clients.name}</span>}
                      {v.views != null
                        ? <span className="task-due">▶ {v.views.toLocaleString('de-DE')} Aufrufe</span>
                        : <span className="task-due">noch keine Zahlen</span>}
                    </div>
                  </div>
                  <button
                    className={ohneLink ? 'link-missing' : 'stats-refresh'}
                    onClick={() => setLinks(v)}
                    title={ohneLink ? 'Adresse des Postings nachtragen' : 'Zahlen jetzt holen'}
                  >
                    {ohneLink ? '🔗 Link fehlt' : `⟳ ${v.stats_updated_at ? seit(v.stats_updated_at) : 'nie geprüft'}`}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {links && (
        <PostLinksModal
          video={links}
          onClose={() => setLinks(null)}
          onSaved={() => { reloadHeuteRaus(); toast('Gespeichert ✓') }}
        />
      )}

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
