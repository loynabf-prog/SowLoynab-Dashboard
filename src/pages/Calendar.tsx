import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type EventKind = 'post' | 'task' | 'followup'
interface CalEvent {
  date: string // YYYY-MM-DD
  kind: EventKind
  label: string
  to?: string
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Calendar() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-11
  const [events, setEvents] = useState<CalEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const monthStart = useMemo(() => iso(new Date(year, month, 1)), [year, month])
  const monthEnd = useMemo(() => iso(new Date(year, month + 1, 0)), [year, month])

  useEffect(() => {
    async function load() {
      setError(null)
      const [vids, tasks, leads] = await Promise.all([
        supabase
          .from('videos')
          .select('id, title, scheduled_date, client_id, status')
          .gte('scheduled_date', monthStart)
          .lte('scheduled_date', monthEnd),
        supabase
          .from('tasks')
          .select('id, title, due_date')
          .eq('done', false)
          .gte('due_date', monthStart)
          .lte('due_date', monthEnd),
        supabase
          .from('leads')
          .select('id, name, next_followup')
          .gte('next_followup', monthStart)
          .lte('next_followup', monthEnd),
      ])
      if (vids.error || tasks.error || leads.error) {
        setError((vids.error || tasks.error || leads.error)!.message)
        return
      }
      const ev: CalEvent[] = []
      for (const v of vids.data ?? []) {
        ev.push({ date: (v as any).scheduled_date, kind: 'post', label: `🎬 ${(v as any).title}`, to: `/client/${(v as any).client_id}` })
      }
      for (const t of tasks.data ?? []) {
        ev.push({ date: (t as any).due_date, kind: 'task', label: `✓ ${(t as any).title}`, to: '/aufgaben' })
      }
      for (const l of leads.data ?? []) {
        ev.push({ date: (l as any).next_followup, kind: 'followup', label: `⏰ ${(l as any).name}`, to: '/leads' })
      }
      setEvents(ev)
    }
    load()
  }, [monthStart, monthEnd])

  // Monatsraster (Montag-basiert, 6 Wochen)
  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const offset = (first.getDay() + 6) % 7 // Mo=0
    const start = new Date(year, month, 1 - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return d
    })
  }, [year, month])

  function prev() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else setMonth((m) => m - 1)
  }
  function next() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else setMonth((m) => m + 1)
  }

  const todayIso = iso(today)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kalender</h1>
          <span className="sub">Posts · Aufgaben · Follow-ups</span>
        </div>
        <div className="spacer" />
        <div className="cal-nav">
          <button className="btn btn-sm" onClick={prev}>←</button>
          <span className="cal-title">{MONTHS[month]} {year}</span>
          <button className="btn btn-sm" onClick={next}>→</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}>
            Heute
          </button>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="cal-legend">
        <span><i className="dot post" /> Post</span>
        <span><i className="dot task" /> Aufgabe</span>
        <span><i className="dot followup" /> Follow-up</span>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div className="cal-weekday" key={w}>{w}</div>
        ))}
        {cells.map((d, i) => {
          const dIso = iso(d)
          const inMonth = d.getMonth() === month
          const dayEvents = events.filter((e) => e.date === dIso)
          return (
            <div className={`cal-cell ${inMonth ? '' : 'muted-cell'} ${dIso === todayIso ? 'today' : ''}`} key={i}>
              <div className="cal-daynum">{d.getDate()}</div>
              <div className="cal-events">
                {dayEvents.map((e, j) => (
                  <button
                    key={j}
                    className={`cal-event ${e.kind}`}
                    onClick={() => e.to && navigate(e.to)}
                    title={e.label}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
