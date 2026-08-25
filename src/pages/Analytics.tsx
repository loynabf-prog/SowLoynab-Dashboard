import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoFrame from '../components/LogoFrame'

interface PostRow {
  client_id: string
  posted_at: string | null
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  views_ig: number | null
  views_tiktok: number | null
  clients?: { name: string; logo_url: string | null } | null
}

interface StatRow {
  client_id: string
  captured_on: string
  followers_ig: number | null
  followers_tiktok: number | null
}

const num = (n: number) => n.toLocaleString('de-DE')

export default function Analytics() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PostRow[]>([])
  const [statRows, setStatRows] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'all' | 'month'>('all')

  useEffect(() => {
    supabase
      .from('videos')
      // "*" statt fester Spaltenliste -- damit die Abfrage nicht hart fehlschlägt,
      // solange Migration 0020 (views_ig/views_tiktok) noch nicht eingespielt ist
      .select('*, clients(name, logo_url, deleted_at)')
      .eq('status', 'posted')
      .is('deleted_at', null)
      .then(({ data }) => {
        // Videos geloeschter Kunden ebenfalls raus (ihr eigenes deleted_at ist leer)
        const rows = (data ?? []).filter((r: any) => !r.clients?.deleted_at)
        setRows(rows as unknown as PostRow[])
        setLoading(false)
      })
    supabase
      .from('client_stats')
      .select('client_id, captured_on, followers_ig, followers_tiktok, clients(deleted_at)')
      .order('captured_on', { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []).filter((r: any) => !r.clients?.deleted_at)
        setStatRows(rows as StatRow[])
      })
  }, [])

  // Neuester Follower-Stand je Kunde (statRows ist aufsteigend sortiert -> letzter Eintrag gewinnt)
  const followerTotals = useMemo(() => {
    const latestByClient = new Map<string, { ig: number; tt: number }>()
    for (const r of statRows) latestByClient.set(r.client_id, { ig: r.followers_ig ?? 0, tt: r.followers_tiktok ?? 0 })
    let ig = 0, tt = 0
    for (const v of latestByClient.values()) { ig += v.ig; tt += v.tt }
    return { ig, tt, total: ig + tt }
  }, [statRows])

  const monthPrefix = new Date().toISOString().slice(0, 7)
  const filtered = useMemo(
    () => (range === 'month' ? rows.filter((r) => (r.posted_at ?? '').startsWith(monthPrefix)) : rows),
    [rows, range, monthPrefix],
  )

  const totals = useMemo(() => {
    const reach = filtered.reduce((s, r) => s + (r.reach ?? r.views ?? 0), 0)
    const likes = filtered.reduce((s, r) => s + (r.likes ?? 0), 0)
    const comments = filtered.reduce((s, r) => s + (r.comments ?? 0), 0)
    return { posts: filtered.length, reach, likes, comments }
  }, [filtered])

  const perClient = useMemo(() => {
    const map = new Map<string, { name: string; logo: string | null; posts: number; reach: number }>()
    for (const r of filtered) {
      const cur = map.get(r.client_id) ?? { name: r.clients?.name ?? 'Kunde', logo: r.clients?.logo_url ?? null, posts: 0, reach: 0 }
      cur.posts += 1
      cur.reach += r.reach ?? r.views ?? 0
      map.set(r.client_id, cur)
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.reach - a.reach)
  }, [filtered])

  const maxReach = perClient[0]?.reach || 1

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Gesamt-Analyse</h1>
          <span className="sub">{loading ? 'Lade …' : 'Alle Kunden zusammengerechnet'}</span>
        </div>
        <div className="spacer" />
        <div className="seg">
          <button className={`seg-btn ${range === 'all' ? 'on' : ''}`} onClick={() => setRange('all')}>Gesamt</button>
          <button className={`seg-btn ${range === 'month' ? 'on' : ''}`} onClick={() => setRange('month')}>Dieser Monat</button>
        </div>
      </div>

      <div className="fin-tiles" style={{ marginBottom: 22 }}>
        <div className="fin-tile"><span className="fin-label">Posts</span><span className="fin-value">{num(totals.posts)}</span><span className="fin-sub">gepostete Videos</span></div>
        <div className="fin-tile"><span className="fin-label">Reichweite gesamt</span><span className="fin-value income">{num(totals.reach)}</span><span className="fin-sub">Menschen erreicht</span></div>
        <div className="fin-tile"><span className="fin-label">Ø Reichweite / Post</span><span className="fin-value">{num(totals.posts ? Math.round(totals.reach / totals.posts) : 0)}</span><span className="fin-sub">Schnitt</span></div>
        <div className="fin-tile"><span className="fin-label">Interaktionen</span><span className="fin-value">{num(totals.likes)}</span><span className="fin-sub">Likes · {num(totals.comments)} Kommentare</span></div>
        {followerTotals.total > 0 && (
          <div className="fin-tile"><span className="fin-label">👥 Follower gesamt</span><span className="fin-value">{num(followerTotals.total)}</span><span className="fin-sub">📸 {num(followerTotals.ig)} · 🎵 {num(followerTotals.tt)}</span></div>
        )}
      </div>

      <h2 className="section-title" style={{ marginBottom: 12 }}>Nach Kunde</h2>
      {!loading && perClient.length === 0 && (
        <div className="col-empty">Noch keine geposteten Videos. Sobald Videos auf „Gepostet" wandern, erscheint hier die Auswertung. 📊</div>
      )}
      <div className="analyse-list">
        {perClient.map((c) => (
          <button className="ga-row" key={c.id} onClick={() => navigate(`/client/${c.id}`)}>
            <LogoFrame name={c.name} logoUrl={c.logo} className="ga-logo" />
            <div className="ga-main">
              <div className="ga-name">{c.name}</div>
              <div className="ga-bar"><span style={{ width: `${Math.max(4, (c.reach / maxReach) * 100)}%` }} /></div>
            </div>
            <div className="ga-stats">
              <span className="ga-reach">{num(c.reach)}</span>
              <span className="ga-posts">{c.posts} {c.posts === 1 ? 'Post' : 'Posts'}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
