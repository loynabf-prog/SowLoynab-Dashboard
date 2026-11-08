// Die vier Raeume des CRM (Fassie, 01.11.2026: "Agentur-System 2.0").
// ---------------------------------------------------------------------------
//   Heute      Alltag: was ist heute dran? (Heute, Kalender, Plan, Videos)
//   Kunden     das eigentliche CRM (Kunden, Pipeline, Monate, Dokumente)
//   Zahlen     nur Ergebnisse, laeuft im Hintergrund (Analyse, Umsatz)
//   Werkstatt  Produktion: Videos aussuchen, im Chat schneiden; Ideen
// Unten in der Leiste stehen genau diese vier. Jeder Raum hat oben seine
// Reiter. Alles, was in keinem Raum liegt, bleibt unter "Mehr".

import { Sun, Users, BarChart3, Scissors, type LucideIcon } from 'lucide-react'

export type RaumKey = 'heute' | 'kunden' | 'zahlen' | 'werkstatt'

export interface RaumReiter { to: string; label: string; end?: boolean }

export interface Raum {
  key: RaumKey
  label: string
  icon: LucideIcon
  /** Erster Reiter = Startseite des Raums */
  reiter: RaumReiter[]
  /** Weitere Pfade (Praefixe), die zu diesem Raum gehoeren, ohne eigenen Reiter */
  auch?: string[]
}

export const RAEUME: Raum[] = [
  { key: 'heute', label: 'Heute', icon: Sun,
    reiter: [
      { to: '/', label: 'Heute', end: true },
      { to: '/kalender', label: 'Kalender' },
      { to: '/plan', label: 'Plan' },
      { to: '/ofen', label: 'Videos' },
    ], auch: ['/aufgaben', '/posting', '/videos'] },
  { key: 'kunden', label: 'Kunden', icon: Users,
    reiter: [
      { to: '/kunden', label: 'Kunden' },
      { to: '/leads', label: 'Pipeline' },
      { to: '/monate', label: 'Monate' },
      { to: '/dokumente', label: 'Dokumente' },
    ], auch: ['/client/', '/brand', '/firma', '/rechnungen'] },
  { key: 'zahlen', label: 'Zahlen', icon: BarChart3,
    reiter: [
      { to: '/analyse', label: 'Analyse' },
      { to: '/umsatz', label: 'Umsatz' },
    ], auch: ['/leistung'] },
  { key: 'werkstatt', label: 'Werkstatt', icon: Scissors,
    reiter: [
      { to: '/werkstatt', label: 'Schneiden' },
      { to: '/lexikon', label: 'Ideen' },
    ], auch: ['/inspirationen', '/medien'] },
]

function passt(pfad: string, to: string, end?: boolean): boolean {
  if (end) return pfad === to
  return pfad === to || pfad.startsWith(to.endsWith('/') ? to : to + '/')
}

/** In welchem Raum liegt dieser Pfad? */
export function raumVon(pfad: string): Raum | undefined {
  return RAEUME.find((r) => r.reiter.some((x) => passt(pfad, x.to, x.end)) || (r.auch ?? []).some((a) => passt(pfad, a)))
}
