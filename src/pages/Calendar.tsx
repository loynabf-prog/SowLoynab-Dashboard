import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type ViewMode = 'day' | '3day' | 'week' | 'month'
type EventKind = 'post' | 'task' | 'followup'

interface CalEvent {
  date: string // YYYY-MM-DD
  time: string | null
  kind: EventKind
  title: string
  sub?: string
  to?: string
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

export default function Calendar() {
  const navigate = useNavigate()
  const today = new Date()
  const [view, setView] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('cal-view') as ViewMode) || 'week' } catch { return 'week' }
  })
  const [anchor, setAnchor] = useState<Date>(today)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)

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

  useEffect(() => {
    async function load() {
      setError(null)
      const from = iso(days[0])
      const to = iso(days[days.length - 1])
      const [vids, tasks, leads] = await Promise.all([
        supabase
          .from('videos')
          .select('id, title, scheduled_date, scheduled_time, client_id, clients(name)')
          .is('deleted_at', null)
          .gte('scheduled_date', from)
          .lte('scheduled_date', to),
        supabase
          .from('tasks')
          .select('id, title, due_date, done, clients(name), leads(name)')
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
        ev.push({ date: v.scheduled_date, time: v.scheduled_time ?? null, kind: 'post', title: v.title, sub: v.clients?.name, to: `/client/${v.client_id}` })
      }
      for (const t of (tasks.data ?? []) as any[]) {
        ev.push({ date: t.due_date, time: null, kind: 'task', title: t.title, sub: t.clients?.name || t.leads?.name, to: '/aufgaben' })
      }
      for (const l of (leads.data ?? []) as any[]) {
        ev.push({ date: l.next_followup, time: null, kind: 'followup', title: l.name, sub: 'Follow-up', to: '/leads' })
      }
      setEvents(ev)
    }
    load()
  }, [days])

  function eventsFor(dIso: string): CalEvent[] {
    return events
      .filter((e) => e.date === dIso)
      .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  }

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
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
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
              <div className={`cal-cell ${inMonth ? '' : 'muted-cell'} ${dIso === todayIso ? 'today' : ''}`} key={i}>
                <div className="cal-daynum">{d.getDate()}</div>
                <div className="cal-events">
                  {list.map((e, j) => (
                    <button key={j} className={`cal-event ${e.kind}`} onClick={() => e.to && navigate(e.to)} title={e.title}>
                      {e.title}
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
              <div className={`agenda-col ${isToday ? 'today' : ''}`} key={i}>
                <div className="agenda-head">
                  <span className="agenda-wd">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                  <span className="agenda-day">{d.getDate()}. {MONTHS[d.getMonth()].slice(0, 3)}</span>
                  {isToday && <span className="agenda-today">Heute</span>}
                </div>
                <div className="agenda-body">
                  {list.length === 0 && <div className="col-empty">—</div>}
                  {list.map((e, j) => (
                    <button key={j} className={`agenda-event ${e.kind}`} onClick={() => e.to && navigate(e.to)}>
                      {e.time && <span className="ev-time">{e.time.slice(0, 5)}</span>}
                      <span className="ev-title">{e.title}</span>
                      {e.sub && <span className="ev-sub">{e.sub}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
