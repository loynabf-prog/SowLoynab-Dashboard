// Tagesplan: ein Tag als Zeitleiste 5-20 Uhr. Agentur = volle Breite,
// Fassie = links, Lion = rechts. Im Kalender gross mit Pfeilen, auf der
// Startseite kompakt (kleinere Stunden, keine Pfeile).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CalEventRow } from '../lib/types'
import { AGENTUR, farbeVon, plus, spurVon, type Spur } from '../lib/kalender'
import WochenLeiste, { useWischen } from './WochenLeiste'

const VON = 5, BIS = 20

function minuten(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export default function Tagesplan({ tag, heute, termine, personen, spuren, sichtbar, onTag, onTermin, onNeu, kompakt, hatTermin }: {
  tag: string; heute: string; termine: CalEventRow[]; personen: string[]; spuren: Spur[]; sichtbar: string[]
  onTag?: (t: string) => void; onTermin: (e: CalEventRow) => void; onNeu: (spur: string, zeit: string) => void
  /** Punkte in der Wochenleiste */
  hatTermin?: (t: string) => boolean
  /** Startseite: kleiner, ohne Pfeile und ohne Ganzer-Tag-Knopf */
  kompakt?: boolean
}) {
  const STUNDE = kompakt ? 36 : 60
  const [ganz, setGanz] = useState(false)
  const von = ganz ? 0 : VON, bis = ganz ? 24 : BIS
  const mitZeit = termine.filter((e) => e.starts_at && sichtbar.includes(spurVon(e.member_ids, personen)))
  const ganztags = termine.filter((e) => !e.starts_at && sichtbar.includes(spurVon(e.member_ids, personen)))
  const [ich, er] = personen
  const lage = (e: CalEventRow): { left: string; right: string } => {
    const s = spurVon(e.member_ids, personen)
    if (s === AGENTUR) return { left: '0', right: '0' }
    return s === ich ? { left: '0', right: '50%' } : s === er ? { left: '50%', right: '0' } : { left: '0', right: '0' }
  }
  // Was ausserhalb 5-20 liegt, aber heute dran ist
  const ausserhalb = !ganz && mitZeit.some((e) => (minuten(e.starts_at)! < VON * 60) || ((minuten(e.ends_at) ?? minuten(e.starts_at)! + 60) > BIS * 60))
  // Jetzt-Linie wandert jede Minute mit
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => setTick((x) => x + 1), 60_000); return () => window.clearInterval(t) }, [])
  void tick
  const jetzt = tag === heute ? new Date().getHours() * 60 + new Date().getMinutes() : null
  // Wischen auf der Zeitleiste = Tag vor/zurueck (wie iPhone)
  const wisch = useWischen(() => onTag?.(plus(tag, 1)), () => onTag?.(plus(tag, -1)))

  // Startseite: Zeitleiste scrollt in sich und beginnt eine Stunde vor jetzt
  // (bzw. kurz vor dem ersten Termin an anderen Tagen). Fassie, 02.11.2026.
  const box = useRef<HTMLDivElement>(null)
  const erster = mitZeit.map((e) => minuten(e.starts_at)!).sort((a, b) => a - b)[0]
  const ziel = jetzt != null ? jetzt - 60 : erster != null ? erster - 30 : 8 * 60
  useLayoutEffect(() => {
    if (!kompakt || !box.current) return
    box.current.scrollTop = Math.max(0, ((ziel - von * 60) / 60) * STUNDE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kompakt, tag, von, erster])
  // Hoehe: bis knapp ueber die Leiste unten, damit der Plan den Bildschirm fuellt
  useEffect(() => {
    if (!kompakt) return
    const passen = () => {
      const el = box.current; if (!el) return
      const oben = el.getBoundingClientRect().top + window.scrollY
      const unten = (document.querySelector('.n-leiste') as HTMLElement | null)?.offsetHeight ?? 0
      el.style.height = `${Math.max(260, window.innerHeight - oben - unten - 16)}px`
    }
    passen()
    window.addEventListener('resize', passen)
    const t = window.setTimeout(passen, 400)
    return () => { window.removeEventListener('resize', passen); window.clearTimeout(t) }
  }, [kompakt, termine.length])

  function klick(ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.target !== ev.currentTarget) return
    const r = ev.currentTarget.getBoundingClientRect()
    const min = von * 60 + Math.floor(((ev.clientY - r.top) / STUNDE) * 60 / 30) * 30
    const spur = personen.length >= 2 ? ((ev.clientX - r.left) / r.width < 0.5 ? ich : er) : AGENTUR
    onNeu(spur, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
  }

  return (
    <section className={`kal-tagplan ${kompakt ? 'kompakt' : ''}`}>
      {onTag && <WochenLeiste tag={tag} heute={heute} onTag={onTag} hatTermin={hatTermin} />}
      {ganztags.length > 0 && (
        <div className="kal-ganztags">
          {ganztags.map((e) => <button key={e.id} style={{ ['--f' as string]: farbeVon(e) }} onClick={() => onTermin(e)}>{e.title}</button>)}
        </div>
      )}
      <div className="kal-spalten-kopf">
        {personen.length >= 2 ? <><span>{spuren.find((s) => s.key === ich)?.name}</span><span>{spuren.find((s) => s.key === er)?.name}</span></> : <span>Agentur</span>}
      </div>
      <div className={kompakt ? 'kal-scroll' : undefined} ref={box}>
      <div className="kal-zeit" {...(onTag ? wisch : {})}>
        <div className="kal-stunden">
          {Array.from({ length: bis - von + 1 }, (_, i) => <span key={i} style={{ top: i * STUNDE }}>{String(von + i).padStart(2, '0')}</span>)}
        </div>
        <div className="kal-raster-zeit" style={{ height: (bis - von) * STUNDE }} onClick={klick}>
          {Array.from({ length: bis - von }, (_, i) => <i key={i} className="kal-linie" style={{ top: i * STUNDE }} />)}
          <i className="kal-mitte" />
          {jetzt != null && jetzt >= von * 60 && jetzt <= bis * 60 && <i className="kal-jetzt" style={{ top: ((jetzt - von * 60) / 60) * STUNDE }} />}
          {mitZeit.map((e) => {
            const a = Math.max(von * 60, minuten(e.starts_at)!)
            const z = Math.min(bis * 60, minuten(e.ends_at) ?? minuten(e.starts_at)! + 60)
            if (z <= a) return null
            const top = ((a - von * 60) / 60) * STUNDE, hoehe = Math.max(22, ((z - a) / 60) * STUNDE - 2)
            return (
              <button key={e.id} className={`kal-block ${hoehe < (kompakt ? 30 : 40) ? 'klein' : ''}`} style={{ top, height: hoehe, ...lage(e), ['--f' as string]: farbeVon(e) }} onClick={(ev) => { ev.stopPropagation(); onTermin(e) }}>
                <strong>{e.title}</strong>
                <small>{e.starts_at!.slice(0, 5)}{e.ends_at ? `–${e.ends_at.slice(0, 5)}` : ''}{e.clients?.name ? ` · ${e.clients.name}` : ''}</small>
              </button>
            )
          })}
        </div>
      </div>
      </div>
      {(!kompakt || ausserhalb) && <button className="kal-ganz" onClick={() => setGanz((g) => !g)}>{ganz ? 'Nur 5–20 Uhr' : ausserhalb ? 'Ganzer Tag (es gibt Termine außerhalb 5–20 Uhr)' : 'Ganzer Tag anzeigen'}</button>}
    </section>
  )
}
