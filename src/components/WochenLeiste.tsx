// Wochenleiste wie im iPhone-Kalender: M D M D F S S, darunter die Zahlen.
// Tipp auf einen Tag = diesen Tag zeigen. Wischen links/rechts = Woche
// vor/zurueck. Heute = orange, gewaehlter Tag = gefuellter Kreis.
// Fassie (02.11.2026): "wie im iPhone Kalender, wenn man auf einen Tag
// drauf klickt" -- im Kalender und auf Heute.

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONATE, ausIso, plus } from '../lib/kalender'

const BUCHST = ['M', 'D', 'M', 'D', 'F', 'S', 'S']
const WT_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const MON_KURZ = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']

export function wochenStart(tag: string): string {
  return plus(tag, -((ausIso(tag).getDay() + 6) % 7))
}

/** Wischgeste (links/rechts) fuer ein Element; vertikales Scrollen bleibt frei. */
export function useWischen(onLinks: () => void, onRechts: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY } },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current; start.current = null
      if (!s) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x, dy = t.clientY - s.y
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx < 0) onLinks(); else onRechts()
    },
  }
}

export default function WochenLeiste({ tag, heute, onTag, hatTermin }: {
  tag: string; heute: string; onTag: (t: string) => void
  /** Punkt unter dem Tag, wenn da was ist */
  hatTermin?: (t: string) => boolean
}) {
  const mo = wochenStart(tag)
  const tage = Array.from({ length: 7 }, (_, i) => plus(mo, i))
  const wisch = useWischen(() => onTag(plus(tag, 7)), () => onTag(plus(tag, -7)))
  const d = ausIso(tag)
  const titel = `${WT_LANG[(d.getDay() + 6) % 7]} – ${d.getDate()}. ${MON_KURZ[d.getMonth()]} ${d.getFullYear()}`
  const monat = ausIso(mo)

  return (
    <div className="wl">
      <div className="wl-kopf">
        <button onClick={() => onTag(plus(tag, -7))} aria-label="Woche zurück"><ChevronLeft /></button>
        <span>{MONATE[monat.getMonth()]}{ausIso(plus(mo, 6)).getMonth() !== monat.getMonth() ? ` / ${MONATE[ausIso(plus(mo, 6)).getMonth()]}` : ''}</span>
        {tag !== heute && <button className="wl-heute" onClick={() => onTag(heute)}>Heute</button>}
        <button onClick={() => onTag(plus(tag, 7))} aria-label="Woche vor"><ChevronRight /></button>
      </div>
      <div className="wl-tage" {...wisch}>
        {tage.map((t, i) => (
          <button key={t} className={`wl-tag ${t === heute ? 'heute' : ''} ${t === tag ? 'gewaehlt' : ''} ${i >= 5 ? 'we' : ''}`} onClick={() => onTag(t)}>
            <span className="wl-b">{BUCHST[i]}</span>
            <span className="wl-nr">{Number(t.slice(8))}</span>
            <i className={hatTermin?.(t) ? 'da' : ''} />
          </button>
        ))}
      </div>
      <div className="wl-titel">{titel}</div>
    </div>
  )
}
