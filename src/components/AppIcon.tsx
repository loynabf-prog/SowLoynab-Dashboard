// App-Symbol wie auf dem iPhone-Homebildschirm: farbiges Quadrat, Icon,
// ein Wort darunter, rote Zahl oben rechts. Kein Erklaertext -- die
// Intelligenz steckt dahinter, nicht davor (Fassie, Okt 2026).

import type { LucideIcon } from 'lucide-react'

export type AppFarbe = 'glut' | 'rot' | 'gelb' | 'gruen' | 'blau' | 'lila' | 'grau' | 'tinte' | 'tuerkis' | 'pink'

export default function AppIcon({ icon: I, farbe, titel, badge, puls, aus, onClick }: {
  icon: LucideIcon
  farbe: AppFarbe | string
  titel: string
  /** Rote Zahl oben rechts; 0/undefined = keine. */
  badge?: number | null
  /** Pulsierender Punkt: hier laeuft gerade etwas. */
  puls?: boolean
  /** Ausgegraut: gerade nichts drin. */
  aus?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`app ${aus ? 'aus' : ''}`} onClick={onClick} aria-label={badge ? `${titel}, ${badge}` : titel}>
      <span className={`app-ic ${farbe}`}>
        <I strokeWidth={2.2} />
        {!!badge && <span className="app-badge">{badge > 99 ? '99+' : badge}</span>}
        {puls && <span className="app-puls" />}
      </span>
      <span className="app-titel">{titel}</span>
    </button>
  )
}

/** Raster wie der Homebildschirm: 4 je Reihe am Handy, mehr am Rechner. */
export function AppRaster({ children, titel }: { children: React.ReactNode; titel?: string }) {
  return (
    <section className="app-bereich">
      {titel && <div className="app-bereich-titel">{titel}</div>}
      <div className="app-raster">{children}</div>
    </section>
  )
}

/**
 * Kennzahl-Kachel fuers Dashboard: getoentes Symbol, Titel, grosse Zahl.
 * Ohne Zahl zeigt sie einen feinen Pfeil -- dann ist es ein Einstieg.
 */
export function Kachel({ icon: I, farbe, titel, wert, aktiv, puls, onClick }: {
  icon: LucideIcon
  farbe: AppFarbe | string
  titel: string
  wert?: string | number | null
  /** Hervorheben: hier wartet etwas auf dich. */
  aktiv?: boolean
  puls?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`kachel ${aktiv ? 'aktiv' : ''}`} onClick={onClick}>
      <span className="kachel-kopf">
        <span className={`app-ic klein ${farbe}`}><I strokeWidth={2.1} />{puls && <span className="app-puls" />}</span>
        <span className="kachel-titel">{titel}</span>
      </span>
      {wert != null && wert !== '' ? <span className="kachel-wert">{wert}</span> : <span className="kachel-pfeil" aria-hidden>›</span>}
    </button>
  )
}

/** Schlanke Werkzeugleiste: Symbol + ein Wort. */
export function Aktion({ icon: I, titel, haupt, onClick }: { icon: LucideIcon; titel: string; haupt?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`aktion ${haupt ? 'haupt' : ''}`} onClick={onClick}>
      <I strokeWidth={2.2} />
      <span>{titel}</span>
    </button>
  )
}
export function Aktionen({ children }: { children: React.ReactNode }) {
  return <div className="aktionen">{children}</div>
}
