import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePointerBoard } from '../lib/usePointerBoard'
import { useCategories } from '../context/CategoryContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import TaskModal from '../components/TaskModal'
import LogoFrame from '../components/LogoFrame'

type ViewMode = 'day' | '3day' | 'week' | 'month'
type EventKind = 'post' | 'task' | 'followup'

interface CalEvent {
  id?: string
  date: string // YYYY-MM-DD
  time: string | null
  kind: EventKind
  title: string
  sub?: string
  to?: string
  color?: string // Kategorie-Farbe (Aufgaben)
  logo?: string | null // Kunden-Logo (Posts)
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const VIEWS: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Tag' },
  { key: '3day', label: '3 Tage' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
]

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7))
}

interface Option { id: string; name: string }

export default function Calendar() {
  const navigate = useNavigate()
  const { byId } = useCategories()
  const { user } = useAuth()
  const { toast } = useToast()
  const today = new Date()
  const [view, setView] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('cal-view') as ViewMode) || 'week' } catch { return 'week' }
  })
  const [anchor, setAnchor] = useState<Date>(today)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dayOpen, setDayOpen] = useState<string | null>(null)   // Tagesübersicht (ISO)
  const [addFor, setAddFor] = useState<string | null>(null)      // neue Aufgabe für Tag (ISO)
  const [clientOpts, setClientOpts] = useState<Option[]>([])
  const [leadOpts, setLeadOpts] = useState<Option[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setClientOpts((data ?? []) as Option[]))
    supabase.from('leads').select('id, name').is('deleted_at', null).order('name').then(({ data }) => setLeadOpts((data ?? []) as Option[]))
  }, [])

  useEffect(() => {
    try { localStorage.setItem('cal-view', view) } catch { /* Speicher gesperrt -> egal */ }
  }, [view])

  // Sichtbare Tage je Ansicht
  const days = useMemo<Date[]>(() => {
    if (view === 'day') return [anchor]
    if (view === '3day') return [0, 1, 2].map((i) => addDays(anchor, i))
    if (view === 'week') {
      const mon = mondayOf(anchor)
      return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
    }
    // month: 6 Wochen ab Montag vor dem 1.
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const start = mondayOf(first)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [view, anchor])

  const load = useCallback(async () => {
    setError(null)
    const from = iso(days[0])
    const to = iso(days[days.length - 1])
    const [vids, tasks, leads] = await Promise.all([
      supabase
        .from('videos')
        .select('*, clients(name, logo_url)')
        .is('deleted_at', null)
        .gte('scheduled_date', from)
        .lte('scheduled_date', to),
      supabase
        .from('tasks')
        .select('*, clients(name), leads(name)')
        .eq('done', false)
        .is('deleted_at', null)
        .gte('due_date', from)
        .lte('due_date', to),
      supabase
        .from('leads')
        .select('id, name, next_followup')
        .is('deleted_at', null)
        .gte('next_followup', from)
        .lte('next_followup', to),
    ])
    if (vids.error || tasks.error || leads.error) {
      setError((vids.error || tasks.error || leads.error)!.message)
      return
    }
    const ev: CalEvent[] = []
    for (const v of (vids.data ?? []) as any[]) {
      ev.push({ id: v.id, date: v.scheduled_date, time: v.scheduled_time ?? null, kind: 'post', title: v.title, sub: v.clients?.name, to: `/client/${v.client_id}`, logo: v.clients?.logo_url ?? null, color: byId(v.category)?.color })
    }
    for (const t of (tasks.data ?? []) as any[]) {
      ev.push({ id: t.id, date: t.due_date, time: null, kind: 'task', title: t.title, sub: t.clients?.name || t.leads?.name, to: `/aufgaben?open=${t.id}`, color: byId(t.category)?.color })
    }
    for (const l of (leads.data ?? []) as any[]) {
      ev.push({ date: l.next_followup, time: null, kind: 'followup', title: l.name, sub: 'Follow-up', to: '/leads' })
    }
    setEvents(ev)
  }, [days, byId])

  useEffect(() => { load() }, [load])

  function eventsFor(dIso: string): CalEvent[] {
    return events
      .filter((e) => e.date === dIso)
      .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  }

  // Post per Drag auf einen anderen Tag verschieben
  async function reschedule(videoId: string, dateIso: string) {
    setEvents((prev) => prev.map((e) => (e.kind === 'post' && e.id === videoId ? { ...e, date: dateIso } : e)))
    await supabase.from('videos').update({ scheduled_date: dateIso }).eq('id', videoId)
  }
  const { dragId, drop, startDrag } = usePointerBoard(reschedule)

  function step(dir: number) {
    if (view === 'day') setAnchor((a) => addDays(a, dir))
    else if (view === '3day') setAnchor((a) => addDays(a, dir * 3))
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7))
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1))
  }

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  // Titel je Ansicht
  const title = useMemo(() => {
    if (view === 'month') return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
    const a = days[0]
    const b = days[days.length - 1]
    if (view === 'day') return a.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
    const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
    return `${fmt(a)} – ${fmt(b)}`
  }, [view, anchor, days])

  const todayIso = iso(today)

  return (
    <div
      ref={containerRef}
      className="cal-wrap"
      onTouchStart={(e) => {
        // Wisch-Navigation nur, wenn nicht auf einem Termin/Griff gestartet
        const t = e.target as HTMLElement
        if (t.closest('[data-card], .vc-grip, .agenda-event, .cal-event')) { touchX.current = null; return }
        touchX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null || dragId) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Kalender</h1>
          <span className="sub">{title}</span>
        </div>
        <div className="spacer" />
        <div className="seg cal-views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={`seg-btn ${view === v.key ? 'on' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-toolbar">
        <button className="btn btn-sm" onClick={() => step(-1)} aria-label="zurück">←</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setAnchor(new Date())}>Heute</button>
        <button className="btn btn-sm" onClick={() => step(1)} aria-label="weiter">→</button>
        <div className="spacer" />
        <div className="cal-legend">
          <span><i className="dot post" /> Post</span>
          <span><i className="dot task" /> Aufgabe</span>
          <span><i className="dot followup" /> Follow-up</span>
        </div>
        <button className="btn btn-sm" onClick={toggleFullscreen} title="Vollbild / Tafel">🖥 Tafel</button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {view === 'month' ? (
        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div className="cal-weekday" key={w}>{w}</div>
          ))}
          {days.map((d, i) => {
            const dIso = iso(d)
            const inMonth = d.getMonth() === anchor.getMonth()
            const list = eventsFor(dIso)
            return (
              <div className={`cal-cell clickable ${inMonth ? '' : 'muted-cell'} ${dIso === todayIso ? 'today' : ''}`} key={i} onClick={() => setDayOpen(dIso)}>
                <div className="cal-daynum">{d.getDate()}</div>
                <div className="cal-events">
                  {list.map((e, j) => (
                    <button key={j} className={`cal-event ${e.kind}`} style={e.color ? { borderLeft: `3px solid ${e.color}` } : undefined}
                      onClick={(ev) => { ev.stopPropagation(); e.to && navigate(e.to) }} title={e.title}>
                      {e.kind === 'post' && <PostLogo name={e.sub ?? ''} logo={e.logo ?? null} ring={e.color} xs />}
                      <span className="cal-event-t">{e.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={`cal-agenda cols-${days.length}`}>
          {days.map((d, i) => {
            const dIso = iso(d)
            const list = eventsFor(dIso)
            const isToday = dIso === todayIso
            return (
              <div
                className={`agenda-col ${isToday ? 'today' : ''} ${drop?.lane === dIso && dragId ? 'drop-active' : ''}`}
                key={i}
                data-lane={dIso}
              >
                <div className="agenda-head clickable" onClick={() => setDayOpen(dIso)} title="Tag öffnen">
                  <span className="agenda-wd">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                  <span className="agenda-day">{d.getDate()}. {MONTHS[d.getMonth()].slice(0, 3)}</span>
                  {isToday && <span className="agenda-today">Heute</span>}
                  <span className="agenda-add" onClick={(e) => { e.stopPropagation(); setAddFor(dIso) }} title="Aufgabe für diesen Tag">＋</span>
                </div>
                <div className="agenda-body">
                  {list.length === 0 && <div className="col-empty">{dragId ? 'hierher' : '—'}</div>}
                  {list.map((e, j) =>
                    e.kind === 'post' && e.id ? (
                      <div className={`agenda-event-wrap ${dragId === e.id ? 'ghost-source' : ''}`} key={e.id} data-card={e.id}>
                        <span className="cal-grip" data-drag-handle onPointerDown={(ev) => startDrag(ev, e.id!, dIso)}>⠿</span>
                        <button className={`agenda-event ${e.kind}`} onClick={() => e.to && navigate(e.to)}>
                          <PostLogo name={e.sub ?? ''} logo={e.logo ?? null} ring={e.color} />
                          <span className="ev-body">
                            {e.time && <span className="ev-time">{e.time.slice(0, 5)}</span>}
                            <span className="ev-title">{e.title}</span>
                            {e.sub && <span className="ev-sub">{e.sub}</span>}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <button key={j} className={`agenda-event ${e.kind}`} style={e.color ? { borderLeftColor: e.color } : undefined} onClick={() => e.to && navigate(e.to)}>
                        {e.time && <span className="ev-time">{e.time.slice(0, 5)}</span>}
                        <span className="ev-title">{e.title}</span>
                        {e.sub && <span className="ev-sub">{e.sub}</span>}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dayOpen && (
        <DayModal
          dIso={dayOpen}
          events={eventsFor(dayOpen)}
          onClose={() => setDayOpen(null)}
          onNavigate={(to) => { setDayOpen(null); navigate(to) }}
          onAdd={() => { const d = dayOpen; setDayOpen(null); setAddFor(d) }}
          color={(e) => e.color}
        />
      )}

      {addFor && (
        <TaskModal
          task={null}
          userId={user?.id ?? null}
          clients={clientOpts}
          leads={leadOpts}
          defaults={{ due_date: addFor }}
          onClose={() => setAddFor(null)}
          onSaved={() => { setAddFor(null); load(); toast('Aufgabe angelegt ✓') }}
        />
      )}
    </div>
  )
}

// Kunden-Logo mit optionalem Kategorie-Ring (z. B. Rot = dringend)
function PostLogo({ name, logo, ring, xs }: { name: string; logo: string | null; ring?: string; xs?: boolean }) {
  return (
    <span className={`post-logo ${xs ? 'xs' : ''}`} style={ring ? { boxShadow: `0 0 0 1px var(--bg-card), 0 0 0 3px ${ring}` } : undefined}>
      <LogoFrame name={name} logoUrl={logo} className={xs ? 'cal-logo-xs' : 'cal-logo'} />
    </span>
  )
}

function DayModal({
  dIso, events, onClose, onNavigate, onAdd, color,
}: {
  dIso: string
  events: CalEvent[]
  onClose: () => void
  onNavigate: (to: string) => void
  onAdd: () => void
  color: (e: CalEvent) => string | undefined
}) {
  const title = new Date(dIso + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const KIND: Record<EventKind, string> = { post: 'Post', task: 'Aufgabe', followup: 'Follow-up' }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        {events.length === 0 ? (
          <div className="col-empty">Nichts geplant an diesem Tag.</div>
        ) : (
          <div className="day-list">
            {events.map((e, i) => (
              <button key={i} className={`day-ev ${e.kind}`} style={color(e) ? { borderLeftColor: color(e) } : undefined} onClick={() => e.to && onNavigate(e.to)}>
                {e.kind === 'post' && <PostLogo name={e.sub ?? ''} logo={e.logo ?? null} ring={color(e)} />}
                <span className="day-ev-kind">{e.time ? e.time.slice(0, 5) : KIND[e.kind]}</span>
                <span className="day-ev-title">{e.title}</span>
                {e.sub && <span className="day-ev-sub">{e.sub}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Schließen</button>
          <button type="button" className="btn btn-primary" onClick={onAdd}>＋ Aufgabe für diesen Tag</button>
        </div>
      </div>
    </Modal>
  )
}
