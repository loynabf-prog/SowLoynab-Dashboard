import { type Reichweite, reichweiteSatz } from '../lib/reichweite'
import '../styles/reichweite.css'

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/**
 * Der Zeitstrahl: ein Kästchen je Tag des Monats, grün/gelb/rot.
 * Vergangene Tage leicht blass, heute mit Strich darüber.
 */
export default function ReichweiteBalken({ r, klein, titel, satz }: {
  r: Reichweite
  /** Mini-Version für die Kundenliste: nur der Balken. */
  klein?: boolean
  titel?: string
  satz?: string
}) {
  if (r.ziel <= 0 && r.tage.every((t) => t == null)) {
    return klein ? null : <div className="rw rw-leer"><span>Kein Monatsziel – nichts zu prüfen</span></div>
  }
  const heuteTag = r.heute.startsWith(r.monat) ? Number(r.heute.slice(8, 10)) : 0
  const balken = (
    <div className="rw-balken" role="img" aria-label={satz ?? reichweiteSatz(r)}>
      {r.tage.map((f, i) => {
        const tag = i + 1
        return (
          <i
            key={tag}
            className={`rw-tag ${f ?? 'leer'} ${tag < heuteTag ? 'vorbei' : ''} ${tag === heuteTag ? 'heute' : ''}`}
          />
        )
      })}
    </div>
  )
  if (klein) return <div className="rw rw-klein">{balken}</div>
  const monatName = MONATE[Number(r.monat.slice(5, 7)) - 1]
  return (
    <div className="rw">
      <div className="rw-kopf">
        <strong>{titel ?? monatName}</strong>
        <span>{r.gepostet} gepostet · {r.eingeplant} eingeplant · {r.inArbeit} in Arbeit</span>
      </div>
      {balken}
      <div className="rw-skala"><span>1.</span><span>{Math.round(r.tage.length / 2)}.</span><span>{r.tage.length}.</span></div>
      <p className="rw-satz">{satz ?? reichweiteSatz(r)}</p>
    </div>
  )
}
