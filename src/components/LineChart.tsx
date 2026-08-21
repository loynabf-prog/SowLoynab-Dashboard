import { useState } from 'react'

export interface Series {
  key: string
  label: string
  color: string
  points: { x: string; y: number }[] // x = ISO-Datum, aufsteigend
}

// Kompaktes Linien-Diagramm (Follower-/Reichweiten-Verlauf). Inline-SVG, kein
// externes Paket. Dünne 2px-Linien, Endwert-Labels, Legende, Hover-Punkt.
export default function LineChart({ series, height = 150 }: { series: Series[]; height?: number }) {
  const [hover, setHover] = useState<{ i: number; sx: number } | null>(null)
  const W = 560
  const H = height
  const padL = 44, padR = 16, padT = 14, padB = 24

  const allDates = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort()
  const n = allDates.length
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  if (n < 2 || ys.length === 0) return null
  let min = Math.min(...ys), max = Math.max(...ys)
  if (min === max) { min = min - 1; max = max + 1 }
  const pad = (max - min) * 0.12
  min = Math.max(0, min - pad); max = max + pad

  const xAt = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB)

  function pathFor(s: Series): string {
    return s.points
      .map((p) => {
        const i = allDates.indexOf(p.x)
        return `${xAt(i)},${yAt(p.y)}`
      })
      .join(' ')
  }

  const gridVals = [min, (min + max) / 2, max]
  const fmt = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : String(Math.round(v)))
  const lastDate = allDates[n - 1]

  return (
    <div className="linechart">
      <div className="lc-legend">
        {series.map((s) => (
          <span className="lc-legend-item" key={s.key}>
            <i style={{ background: s.color }} /> {s.label}
            {s.points.length > 0 && <strong>{fmt(s.points[s.points.length - 1].y)}</strong>}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          const i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1))
          if (i >= 0 && i < n) setHover({ i, sx: xAt(i) })
        }}
      >
        {gridVals.map((v, k) => (
          <g key={k}>
            <line x1={padL} y1={yAt(v)} x2={W - padR} y2={yAt(v)} className="lc-grid" />
            <text x={padL - 8} y={yAt(v) + 4} className="lc-axis" textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        {hover && <line x1={hover.sx} y1={padT} x2={hover.sx} y2={H - padB} className="lc-cross" />}
        {series.map((s) => (
          <polyline key={s.key} points={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* Endpunkte */}
        {series.map((s) => {
          const last = s.points[s.points.length - 1]
          if (!last) return null
          const i = allDates.indexOf(last.x)
          return <circle key={s.key} cx={xAt(i)} cy={yAt(last.y)} r="4" fill={s.color} stroke="var(--bg-card)" strokeWidth="2" />
        })}
        {/* Hover-Punkte + Werte */}
        {hover && series.map((s) => {
          const p = s.points.find((pp) => allDates.indexOf(pp.x) === hover.i)
          if (!p) return null
          return (
            <g key={s.key}>
              <circle cx={xAt(hover.i)} cy={yAt(p.y)} r="4.5" fill={s.color} stroke="var(--bg-card)" strokeWidth="2" />
              <text x={xAt(hover.i)} y={yAt(p.y) - 9} className="lc-hval" textAnchor="middle" fill={s.color}>{fmt(p.y)}</text>
            </g>
          )
        })}
        {/* X-Beschriftung: erstes & letztes Datum */}
        <text x={padL} y={H - 6} className="lc-axis" textAnchor="start">{new Date(allDates[0]).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</text>
        <text x={W - padR} y={H - 6} className="lc-axis" textAnchor="end">{new Date(lastDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</text>
      </svg>
    </div>
  )
}
