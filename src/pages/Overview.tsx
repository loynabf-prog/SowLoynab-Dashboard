import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import SwipeRow from '../components/SwipeRow'
import LinkQueue from '../components/LinkQueue'
import PostSchritt, { type TagVideo } from '../components/PostSchritt'
import { offeneHeute } from '../lib/postschritte'
import { type TaskRow } from '../components/TaskItem'
import TaskModal from '../components/TaskModal'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

interface Option { id: string; name: string }

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
  post: TagVideo | null
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
  const [posts, setPosts] = useState<TagVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [clientOpts, setClientOpts] = useState<Option[]>([])
  const [leadOpts, setLeadOpts] = useState<Option[]>([])
  const [editing, setEditing] = useState<TaskRow | null>(null)
  // Feierabend-Blick: zwischen heute und morgen umschalten
  const [day, setDay] = useState<'today' | 'tomorrow'>('today')
  // Was heute rausging -- am selben Tag will man da noch dran: Adresse
  // nachtragen, Zahlen holen, zum Kunden springen.

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

  // Alle Videos, die heute oder morgen dran sind -- unabhaengig vom
  // Zustand. Ein heute gepostetes Video verschwindet nicht, es wechselt nur
  // den Schritt: erst Posten, dann die beiden Adressen. Erst danach ist der
  // Tag fuer dieses Video durch.
  const reloadPosts = useCallback(async () => {
    const { data } = await supabase
      .from('videos')
      .select('*, clients(name)')
      .is('deleted_at', null)
      .in('scheduled_date', [iso(new Date()), tomorrowIso()])
      .order('scheduled_time', { ascending: true, nullsFirst: false })
    setPosts((data ?? []) as unknown as TagVideo[])
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
        // Videos von heute und morgen — mehr Vorausblick gibt es hier nicht,
        // alles Weitere steht im Kalender.
        supabase
          .from('videos')
          .select('*, clients(name)')
          .is('deleted_at', null)
          .in('scheduled_date', [iso(new Date()), bis])
          .order('scheduled_time', { ascending: true, nullsFirst: false }),
      ])

      setTasks((tasksRes.data ?? []) as unknown as TaskRow[])
      setPosts((postsRes.data ?? []) as unknown as TagVideo[])
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

  /** Schritt 1: raus damit. Die Karte bleibt stehen und fragt nach den Links. */
  async function markPosted(p: TagVideo) {
    const jetzt = new Date().toISOString()
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'posted', posted_at: jetzt } : x)))
    celebrate()
    const { error } = await supabase.from('videos')
      .update({ status: 'posted', posted_at: jetzt, prep_shot: true, prep_edited: true, prep_scheduled: true })
      .eq('id', p.id)
    // Ohne Migration 0031 gibt es die Vorarbeits-Spalten noch nicht.
    if (error) await supabase.from('videos').update({ status: 'posted', posted_at: jetzt }).eq('id', p.id)
    toast('Gepostet — stark! 🎉')
  }

  /** Schritt 2: Adresse nachtragen. Sind beide da, ist das Video durch. */
  async function setLink(p: TagVideo, feld: 'tiktok_url' | 'instagram_url', url: string) {
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, [feld]: url } : x)))
    const { error } = await supabase.from('videos').update({ [feld]: url }).eq('id', p.id)
    if (error) { toast('Konnte nicht speichern: ' + error.message); reloadPosts(); return }
    const fertig = feld === 'tiktok_url' ? !!p.instagram_url : !!p.tiktok_url
    toast(fertig ? 'Beide Links drin — erledigt ✓' : 'Gespeichert ✓')
  }

  /** Vorarbeit fuer einen kommenden Tag abhaken. */
  async function setVorarbeit(p: TagVideo, key: 'prep_shot' | 'prep_edited' | 'prep_scheduled', wert: boolean) {
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, [key]: wert } : x)))
    const { error } = await supabase.from('videos').update({ [key]: wert }).eq('id', p.id)
    if (error) {
      toast('Dafür fehlt noch das Skript 0031 in der Datenbank.')
      reloadPosts()
    }
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

  // Durch ist ein Video erst, wenn beide Adressen stehen -- nicht schon
  // beim Posten. Das ist die Zahl, die zaehlt.
  const offenePosts = offeneHeute(tagPosts)

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
                ? `${new Date(tagIso + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long' })} — heute schon abhaken, was geht`
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
        <span><strong>{tagPosts.length}</strong> {tagPosts.length === 1 ? 'Video' : 'Videos'} {morgen ? 'morgen' : 'heute'}</span>
        {!morgen && tagPosts.length > 0 && (
          offenePosts === 0
            ? <span className="good">alle durch 🎉</span>
            : <span className="good"><strong>{tagPosts.length - offenePosts}</strong> durch</span>
        )}
        {dringend > 0 && <span className="hot"><strong>{dringend}</strong> dringend</span>}
        {overdue.length > 0 && <span className="hot"><strong>{overdue.length}</strong> überfällig</span>}
      </div>

      {/* Eine einzige Liste: was heute dran ist. Erst mit Uhrzeit, dann der
          Rest. Aufgaben und Uploads gemischt — so wie der Tag auch laeuft. */}
      <div className="section-block">
        <h2 className="section-title">{morgen ? 'Morgen vorbereiten' : 'Jetzt dran'}</h2>
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
                <PostSchritt
                  key={e.key}
                  video={e.post!}
                  modus={morgen ? 'vorher' : 'heute'}
                  zeit={e.time}
                  onOeffnen={() => navigate(`/client/${e.post!.client_id}`)}
                  onPosten={() => markPosted(e.post!)}
                  onLink={(feld, url) => setLink(e.post!, feld, url)}
                  onVorarbeit={(key, wert) => setVorarbeit(e.post!, key, wert)}
                />
              )
            ))}
          </div>
        )}
      </div>

      {!morgen && <LinkQueue />}

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
