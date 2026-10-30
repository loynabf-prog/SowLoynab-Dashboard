// Die Stadt: jedes Gebaeude ein Kunde, in der Mitte das Agentur-Haus.
// Ein SVG, das aus Zahlen gezeichnet wird -- keine Bilder, laedt sofort,
// sieht auf jedem Handy gleich aus. Nachts leuchten die Fenster.

import { useMemo, useState } from 'react'
import type { Gebaeude, Level } from '../lib/spiel'

const E = 14           // Rastereinheit (eine Fensterspalte)
const STOCK = 16       // Hoehe eines Stockwerks
const BODEN = 300      // y der Strasse
const LUECKE = 12

interface Props { gebaeude: Gebaeude[]; level: Level; nacht: boolean; onKunde?: (id: string) => void }

export default function Stadt({ gebaeude, level, nacht, onKunde }: Props) {
  const [aktiv, setAktiv] = useState<string | null>(null)

  // Links die Haelfte, rechts die andere -- das Agentur-Haus in der Mitte
  const { links, rechts } = useMemo(() => {
    const l: Gebaeude[] = [], r: Gebaeude[] = []
    gebaeude.forEach((g, i) => (i % 2 === 0 ? l : r).push(g))
    return { links: l.reverse(), rechts: r }
  }, [gebaeude])

  const hqBreite = 4
  const hqStock = 3 + level.nr * 2
  const breiteVon = (g: Gebaeude) => g.breite * 2 + 1 // Einheiten: Fenster + Rand

  // Gesamtbreite ausrechnen, damit die Stadt mittig steht
  const gesamt = [...links, ...rechts].reduce((s, g) => s + breiteVon(g) * E + LUECKE, 0) + hqBreite * E + 2 * LUECKE + 40
  const W = Math.max(390, gesamt)
  const H = 360
  let x = 20

  const haeuser: JSX.Element[] = []
  const zeichne = (g: Gebaeude) => {
    const b = breiteVon(g) * E
    const h = g.stockwerke * STOCK
    haeuser.push(<Haus key={g.id} g={g} x={x} b={b} h={h} nacht={nacht} aktiv={aktiv === g.id} onClick={() => { setAktiv(aktiv === g.id ? null : g.id); onKunde?.(g.id) }} />)
    x += b + LUECKE
  }
  links.forEach(zeichne)
  const hqX = x
  x += hqBreite * E + LUECKE * 2
  rechts.forEach(zeichne)

  const sel = gebaeude.find((g) => g.id === aktiv) ?? null

  return (
    <div className="sp-stadt-wrap">
      <svg className={`sp-stadt ${nacht ? 'nacht' : 'tag'}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Die Agentur-Stadt">
        <defs>
          <linearGradient id="himmel" x1="0" y1="0" x2="0" y2="1">
            {nacht ? <><stop offset="0" stopColor="#0b0f2a" /><stop offset="1" stopColor="#2a1a3a" /></>
              : <><stop offset="0" stopColor="#7fc0ff" /><stop offset="1" stopColor="#ffd9b8" /></>}
          </linearGradient>
          <linearGradient id="boden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={nacht ? '#1a1530' : '#5b6572'} /><stop offset="1" stopColor={nacht ? '#0b0a16' : '#3b434d'} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width={W} height={H} fill="url(#himmel)" />
        {nacht && Array.from({ length: 40 }, (_, i) => (
          <circle key={i} cx={(i * 97) % W} cy={(i * 53) % 200} r={i % 5 === 0 ? 1.4 : 0.8} fill="#fff" opacity={0.35 + ((i * 7) % 10) / 20} />
        ))}
        {!nacht && <circle cx={W - 70} cy={60} r={22} fill="#fff4c2" opacity={0.95} />}
        {nacht && <circle cx={W - 70} cy={60} r={18} fill="#f7f0d8" opacity={0.9} />}
        {/* Hintergrund-Skyline */}
        {Array.from({ length: Math.ceil(W / 60) }, (_, i) => (
          <rect key={i} x={i * 60 + ((i * 17) % 20)} y={BODEN - 60 - ((i * 37) % 70)} width={32 + ((i * 13) % 20)} height={60 + ((i * 37) % 70)} fill={nacht ? '#161a3a' : '#9fb6cc'} opacity={0.7} />
        ))}
        <rect x={0} y={BODEN} width={W} height={H - BODEN} fill="url(#boden)" />
        <line x1={0} y1={BODEN + 28} x2={W} y2={BODEN + 28} stroke={nacht ? '#3a3350' : '#8b949e'} strokeWidth={1} strokeDasharray="14 10" />
        {haeuser}
        <HQ x={hqX} b={hqBreite * E} h={hqStock * STOCK} level={level} nacht={nacht} />
      </svg>
      <div className="sp-legende">
        {sel ? (
          <>
            <strong>{sel.name}</strong>
            <span>{sel.grau ? 'Pausiert' : `${sel.gepostet} von ${sel.ziel || '–'} diesen Monat`}{sel.kran ? ' · im Ofen' : ''}{sel.fahne ? ' · Monat ✓' : ''}</span>
          </>
        ) : <span>Tipp auf ein Gebäude · Fenster = gepostete Videos · Kran = wird geschnitten · Fahne = Monat abgeschlossen</span>}
      </div>
    </div>
  )
}

function Haus({ g, x, b, h, nacht, aktiv, onClick }: { g: Gebaeude; x: number; b: number; h: number; nacht: boolean; aktiv: boolean; onClick: () => void }) {
  const y = BODEN - h
  const farbe = g.grau ? (nacht ? '#3a3a44' : '#9a9aa2') : g.farbe
  const seite = 8
  const spalten = g.breite * 2
  const reihen = g.stockwerke
  const fenster: JSX.Element[] = []
  let nr = 0
  for (let r = 0; r < reihen; r++) {
    for (let c = 0; c < spalten; c++) {
      // Fenster von unten fuellen: so viele an, wie Videos gepostet
      const an = !g.grau && nr < g.fensterAn * Math.max(1, Math.round((reihen * spalten) / Math.max(1, g.fensterGesamt)))
      nr++
      fenster.push(
        <rect key={`${r}-${c}`} x={x + E * 0.35 + c * E} y={y + 6 + r * STOCK} width={E * 0.5} height={STOCK * 0.5} rx={1}
          fill={an ? (nacht ? '#ffd87a' : '#fff8e1') : (nacht ? '#0d1024' : 'rgba(255,255,255,.35)')} opacity={an ? 1 : 0.9}
          filter={an && nacht ? 'url(#glow)' : undefined} />,
      )
    }
  }
  return (
    <g className={`sp-haus ${aktiv ? 'aktiv' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Seite */}
      <polygon points={`${x + b},${y} ${x + b + seite},${y - seite} ${x + b + seite},${BODEN - seite} ${x + b},${BODEN}`} fill={shade(farbe, -35)} />
      {/* Dach */}
      <polygon points={`${x},${y} ${x + seite},${y - seite} ${x + b + seite},${y - seite} ${x + b},${y}`} fill={shade(farbe, 18)} />
      {/* Front */}
      <rect x={x} y={y} width={b} height={h} fill={farbe} />
      {fenster}
      {/* Tuer */}
      <rect x={x + b / 2 - 5} y={BODEN - 12} width={10} height={12} rx={1.5} fill={shade(farbe, -50)} />
      {/* Schild mit Kuerzel */}
      <rect x={x + 3} y={y + 2} width={b - 6} height={10} rx={2} fill="rgba(0,0,0,.35)" />
      <text x={x + b / 2} y={y + 9.5} textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="Space Grotesk, system-ui">{g.kurz}</text>
      {g.eigen && <line x1={x + b / 2} y1={y - seite} x2={x + b / 2} y2={y - seite - 22} stroke="#ffd87a" strokeWidth={1.5} />}
      {g.eigen && <circle cx={x + b / 2} cy={y - seite - 23} r={2.5} fill="#ff5f1f" filter="url(#glow)" />}
      {g.kran && <Kran x={x + b + seite + 2} y={y - seite} />}
      {g.fahne && <Fahne x={x + 6} y={y - seite} />}
      {aktiv && <rect x={x - 3} y={y - seite - 3} width={b + seite + 6} height={h + seite + 6} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 3" rx={3} />}
    </g>
  )
}

function HQ({ x, b, h, level, nacht }: { x: number; b: number; h: number; level: Level; nacht: boolean }) {
  const y = BODEN - h
  const seite = 10
  const reihen = Math.round(h / STOCK)
  return (
    <g className="sp-hq">
      <polygon points={`${x + b},${y} ${x + b + seite},${y - seite} ${x + b + seite},${BODEN - seite} ${x + b},${BODEN}`} fill="#2a1d14" />
      <polygon points={`${x},${y} ${x + seite},${y - seite} ${x + b + seite},${y - seite} ${x + b},${y}`} fill="#4a3426" />
      <rect x={x} y={y} width={b} height={h} fill="#3a2a1e" />
      {Array.from({ length: reihen }, (_, r) => Array.from({ length: 3 }, (_, c) => (
        <rect key={`${r}-${c}`} x={x + 6 + c * (E + 2)} y={y + 6 + r * STOCK} width={E * 0.7} height={STOCK * 0.5} rx={1}
          fill={nacht ? '#ffb15c' : '#fff3df'} opacity={nacht ? 0.95 : 0.8} filter={nacht ? 'url(#glow)' : undefined} />
      )))}
      <rect x={x - 4} y={y - 16} width={b + 8} height={14} rx={3} fill="#17120e" />
      <text x={x + b / 2} y={y - 5.5} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#ff8a4f" fontFamily="Space Grotesk, system-ui" letterSpacing="0.5" filter="url(#glow)">S&amp;L</text>
      <text x={x + b / 2} y={BODEN + 48} textAnchor="middle" fontSize="9" fontWeight="700" fill={nacht ? '#ffd0b0' : '#fff'} fontFamily="Space Grotesk, system-ui">{level.name.toUpperCase()}</text>
      <rect x={x + b / 2 - 7} y={BODEN - 16} width={14} height={16} rx={2} fill="#ff5f1f" />
    </g>
  )
}

function Kran({ x, y }: { x: number; y: number }) {
  return (
    <g className="sp-kran" stroke="#ffd60a" strokeWidth={1.6} fill="none">
      <line x1={x} y1={y} x2={x} y2={y - 46} />
      <line x1={x - 26} y1={y - 46} x2={x + 10} y2={y - 46} />
      <line x1={x} y1={y - 46} x2={x + 10} y2={y - 38} />
      <line x1={x - 22} y1={y - 46} x2={x - 22} y2={y - 26} stroke="#fff" strokeWidth={0.8} />
      <rect x={x - 25} y={y - 26} width={6} height={5} fill="#ff5f1f" stroke="none" />
    </g>
  )
}

function Fahne({ x, y }: { x: number; y: number }) {
  return (
    <g className="sp-fahne">
      <line x1={x} y1={y} x2={x} y2={y - 18} stroke="#fff" strokeWidth={1.2} />
      <polygon points={`${x},${y - 18} ${x + 12},${y - 14.5} ${x},${y - 11}`} fill="#30d158" />
    </g>
  )
}

/** Farbe aufhellen (+) oder abdunkeln (-) in Prozent. */
function shade(hex: string, p: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const v = parseInt(m[1], 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (p > 0 ? (255 - c) * p / 100 : c * p / 100))))
  const r = f((v >> 16) & 255), g = f((v >> 8) & 255), b = f(v & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
