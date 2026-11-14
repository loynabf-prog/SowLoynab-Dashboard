import { useState } from 'react'
import type { Video } from '../lib/types'
import { compactNum } from '../lib/apify'
import '../styles/reichweite.css'

// Die Kundenseite so, wie sie bei TikTok und Instagram aussieht -- nur beide
// Plattformen in einem Raster (Fassie, 14.11.2026). Wir posten fast immer auf
// beiden, also ist es EIN Video mit zwei Links. Zweck: in einer Sekunde sehen,
// ob alles, was wir gepostet haben, auch im CRM steht -- dafuer die echten
// Titelbilder und rote Markierung, wo ein Link oder das Bild fehlt.

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

type FeedVideo = Video & { tiktok_cover?: string | null; ig_cover?: string | null }

function postDatum(v: Video): string {
  return (v.posted_at ?? v.scheduled_date ?? v.created_at).slice(0, 10)
}

function views(v: Video): number | null {
  const a = v.views_tiktok, b = v.views_ig
  if (a == null && b == null) return v.reach ?? v.views ?? null
  return (a ?? 0) + (b ?? 0)
}

export default function PostFeed({ videos, plattformen, onOeffnen }: {
  videos: Video[]
  /** Auf welchen Plattformen der Kunde überhaupt ist -- sonst ist ein fehlender Link kein Fehler. */
  plattformen: { tiktok: boolean; instagram: boolean }
  onOeffnen: (v: Video) => void
}) {
  const gepostet = (videos as FeedVideo[])
    .filter((v) => v.status === 'posted')
    .sort((a, b) => (b.posted_at ?? b.scheduled_date ?? '').localeCompare(a.posted_at ?? a.scheduled_date ?? ''))

  if (gepostet.length === 0) return <p className="feed-leer">Noch nichts gepostet.</p>

  const fehltTT = (v: FeedVideo) => plattformen.tiktok && !v.tiktok_url
  const fehltIG = (v: FeedVideo) => plattformen.instagram && !v.instagram_url
  const luecken = gepostet.filter((v) => fehltTT(v) || fehltIG(v)).length
  const summeViews = gepostet.reduce((s, v) => s + (views(v) ?? 0), 0)
  const letzter = postDatum(gepostet[0])
  const tageSeit = Math.round((Date.now() - new Date(letzter + 'T12:00:00').getTime()) / 86400000)

  // Nach Monat gruppieren, neuester oben -- wie das Profil, nur mit Trennern.
  const gruppen: { key: string; liste: FeedVideo[] }[] = []
  for (const v of gepostet) {
    const k = postDatum(v).slice(0, 7)
    const g = gruppen[gruppen.length - 1]
    if (g && g.key === k) g.liste.push(v)
    else gruppen.push({ key: k, liste: [v] })
  }

  return (
    <div className="feed">
      <div className="feed-kopf">
        <div><b>{gepostet.length}</b><small>Beiträge</small></div>
        <div><b>{compactNum(summeViews)}</b><small>Aufrufe</small></div>
        <div><b>{tageSeit <= 0 ? 'heute' : `vor ${tageSeit} T`}</b><small>letzter Post</small></div>
      </div>
      {luecken > 0 && (
        <div className="feed-hinweis">
          {luecken} {luecken === 1 ? 'Video hat' : 'Videos haben'} noch keinen Link für eine Plattform (rot markiert) – antippen und nachtragen.
        </div>
      )}
      {gruppen.map((g) => (
        <section key={g.key}>
          <div className="feed-monat">{MONATE[Number(g.key.slice(5, 7)) - 1]} {g.key.slice(0, 4)} · {g.liste.length}</div>
          <div className="feed-raster">
            {g.liste.map((v) => {
              const bild = v.tiktok_cover ?? v.ig_cover ?? null
              const n = views(v)
              const warn = fehltTT(v) || fehltIG(v)
              const d = postDatum(v)
              return (
                <button key={v.id} type="button" className={`feed-kachel ${warn ? 'warnung' : ''}`} onClick={() => onOeffnen(v)} title={v.title}>
                  <Titelbild bild={bild} titel={v.title} />
                  <span className="feed-datum">{Number(d.slice(8, 10))}.{Number(d.slice(5, 7))}.</span>
                  <span className="feed-plattform">
                    {(plattformen.tiktok || v.tiktok_url) && <span className={fehltTT(v) ? 'fehlt' : ''}>TT</span>}
                    {(plattformen.instagram || v.instagram_url) && <span className={fehltIG(v) ? 'fehlt' : ''}>IG</span>}
                  </span>
                  {n != null && (
                    <span className="feed-views">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                      {compactNum(n)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Titelbild; fehlt es oder laedt nicht, steht der Videotitel da. */
function Titelbild({ bild, titel }: { bild: string | null; titel: string }) {
  const [kaputt, setKaputt] = useState(false)
  if (!bild || kaputt) return <span className="feed-ohne">{titel}</span>
  return <img src={bild} alt="" loading="lazy" onError={() => setKaputt(true)} />
}
