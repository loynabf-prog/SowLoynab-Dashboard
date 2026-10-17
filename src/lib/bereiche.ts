// Die Bereiche der Agentur -- und welche Seiten zu welchem gehoeren.
// ---------------------------------------------------------------------------
// Eine App, aber klar getrennte Arbeitsbereiche. Jeder Bereich kann spaeter
// einem Mitarbeiter zugeordnet werden: wer nur "analyse" hat, sieht in der
// Navigation nur die Analyse. Leer (null) heisst "sieht alles" -- das ist
// der Normalfall fuer die Gruender.
//
// Das ist Uebersicht, keine Zugriffssperre: alle teilen sich einen Login.

export type BereichKey =
  | 'posting' | 'produktion' | 'kunden' | 'analyse'
  | 'vertrieb' | 'buchhaltung' | 'kommunikation' | 'inhalte' | 'verwaltung'

export interface Seite { to: string; label: string; icon: string; end?: boolean }

export interface Bereich {
  key: BereichKey
  label: string
  /** Ein Satz, wofuer der Bereich da ist -- steht in den Team-Einstellungen. */
  zweck: string
  seiten: Seite[]
  /** In der Hauptleiste statt hinter "Mehr". */
  primaer?: boolean
}

export const BEREICHE: Bereich[] = [
  { key: 'posting', label: 'Posting', zweck: 'Was wann rausgeht — die Seite, die der Kunde sieht', primaer: true,
    seiten: [{ to: '/posting', label: 'Posting', icon: '📣' }] },
  { key: 'produktion', label: 'Produktion', zweck: 'Drehen, schneiden, einplanen, Medien aus Dropbox', primaer: true,
    seiten: [{ to: '/produktion', label: 'Produktion', icon: '🎬' }, { to: '/medien', label: 'Medien', icon: '📁' }] },
  { key: 'kunden', label: 'Kunden', zweck: 'Kundenakten, Verträge, Material', primaer: true,
    seiten: [{ to: '/kunden', label: 'Kunden', icon: '👥' }] },
  { key: 'analyse', label: 'Analyse', zweck: 'Zahlen der geposteten Videos',
    seiten: [{ to: '/analyse', label: 'Gesamt-Analyse', icon: '📊' }, { to: '/leistung', label: 'Leistung', icon: '📈' }] },
  { key: 'vertrieb', label: 'Vertrieb', zweck: 'Leads und Aufgaben',
    seiten: [{ to: '/leads', label: 'Leads-Pipeline', icon: '🎯' }, { to: '/aufgaben', label: 'Aufgaben', icon: '✓' }] },
  { key: 'buchhaltung', label: 'Buchhaltung', zweck: 'Rechnungen und Finanzen',
    seiten: [{ to: '/rechnungen', label: 'Rechnungen', icon: '🧾' }, { to: '/finanzen', label: 'Finanzen', icon: '💶' }] },
  { key: 'kommunikation', label: 'Kommunikation', zweck: 'Postfach',
    seiten: [{ to: '/postfach', label: 'Postfach', icon: '✉️' }] },
  { key: 'inhalte', label: 'Inhalte', zweck: 'Inspirationen und Ideen',
    seiten: [{ to: '/inspirationen', label: 'Inspirationen', icon: '🔖' }] },
  { key: 'verwaltung', label: 'Verwaltung', zweck: 'Team, Einstellungen, Papierkorb',
    seiten: [
      { to: '/team', label: 'Team', icon: '🧑‍🤝‍🧑' },
      { to: '/einstellungen', label: 'Einstellungen', icon: '⚙️' },
      { to: '/papierkorb', label: 'Papierkorb', icon: '🗑' },
    ] },
]

/** Seiten, die jeder sieht: der eigene Tag und der gemeinsame Kalender. */
export const IMMER: Seite[] = [
  { to: '/', label: 'Heute', icon: '☀️', end: true },
  { to: '/kalender', label: 'Kalender', icon: '🗓' },
]

/**
 * Welche Bereiche sieht dieses Mitglied? null/leer = alle. Verwaltung
 * bleibt immer erreichbar, sonst sperrt man sich die Einstellungen weg.
 */
export function sichtbareBereiche(erlaubt: string[] | null | undefined): Bereich[] {
  if (!erlaubt || erlaubt.length === 0) return BEREICHE
  return BEREICHE.filter((b) => b.key === 'verwaltung' || erlaubt.includes(b.key))
}
