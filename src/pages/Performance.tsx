import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

interface Row {
  id: string
  title: string
  client_id: string
  client_name: string
  posted_at: string | null
  scheduled_date: string | null
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
}

// Schnelle Reichweiten-Erfassung: alle geposteten Videos, Zahlen direkt in der
// Zeile eintippen -> speichert automatisch beim Verlassen des Feldes.
export default function Performance() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyOpen, setOnlyOpen] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('videos')
      .select('id, title, client_id, posted_at, scheduled_date, views, reach, likes, comments, status, clients(name)')
      .is('deleted_at', null)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .order('scheduled_date', { ascending: false })
      .limit(200)
    const mapped: Row[] = (data ?? []).map((v: any) => ({
      id: v.id, title: v.title, client_id: v.client_id, client_name: v.clients?.name ?? 'Kunde',
      posted_at: v.posted_at, scheduled_date: v.scheduled_date,
      views: v.views, reach: v.reach, likes: v.likes, comments: v.comments,
    }))
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(id: string, field: keyof Row, value: string) {
    const num = value.trim() === '' ? null : Number(value.replace(/[^\d]/g, ''))
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: num } : r)))
    const { error } = await supabase.from('videos').update({ [field]: num }).eq('id', id)
    if (!error) toast('Gespeichert ✓')
  }

  const shown = onlyOpen ? rows.filter((r) => r.reach == null) : rows
  const openCount = rows.filter((r) => r.reach == null).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leistung</h1>
          <span className="sub">{loading ? 'Lade …' : `${rows.length} gepostete Videos · ${openCount} ohne Reichweite`}</span>
        </div>
        <div className="spacer" />
        <button className={`btn ${onlyOpen ? 'btn-primary' : ''}`} onClick={() => setOnlyOpen((o) => !o)}>
          {onlyOpen ? '✓ Nur offene' : 'Nur offene'}
        </button>
      </div>

      <div className="info-box" style={{ marginBottom: 16 }}>
        💡 Trag die Zahlen aus Instagram/TikTok-Insights hier ein — <strong>Reichweite</strong> ist das Wichtigste.
        Speichert automatisch. Am besten einmal pro Woche durchgehen.
      </div>

      {!loading && shown.length === 0 && <div className="col-empty">{onlyOpen ? 'Alles erfasst. 🎉' : 'Noch keine geposteten Videos.'}</div>}

      <div className="perf-table">
        {shown.length > 0 && (
          <div className="perf-row perf-head">
            <span className="perf-title">Video</span>
            <span>📡 Reichweite</span>
            <span>👁 Aufrufe</span>
            <span>❤️ Likes</span>
            <span>💬 Komm.</span>
          </div>
        )}
        {shown.map((r) => (
          <div className="perf-row" key={r.id}>
            <span className="perf-title" onClick={() => navigate(`/client/${r.client_id}?video=${r.id}`)}>
              <span className="perf-vtitle">{r.title}</span>
              <span className="perf-vsub">{r.client_name} · {(r.posted_at ?? r.scheduled_date ?? '').slice(0, 10)}</span>
            </span>
            <label className="perf-cell"><span className="perf-cell-label">📡 Reichweite</span>
              <input inputMode="numeric" defaultValue={r.reach ?? ''} placeholder="—" className={r.reach == null ? 'perf-empty' : ''} onBlur={(e) => save(r.id, 'reach', e.target.value)} />
            </label>
            <label className="perf-cell"><span className="perf-cell-label">👁 Aufrufe</span>
              <input inputMode="numeric" defaultValue={r.views ?? ''} placeholder="—" onBlur={(e) => save(r.id, 'views', e.target.value)} />
            </label>
            <label className="perf-cell"><span className="perf-cell-label">❤️ Likes</span>
              <input inputMode="numeric" defaultValue={r.likes ?? ''} placeholder="—" onBlur={(e) => save(r.id, 'likes', e.target.value)} />
            </label>
            <label className="perf-cell"><span className="perf-cell-label">💬 Komm.</span>
              <input inputMode="numeric" defaultValue={r.comments ?? ''} placeholder="—" onBlur={(e) => save(r.id, 'comments', e.target.value)} />
            </label>
          </div>
        ))}
      </div>
    </>
  )
}
