// Die Bereiche der Agentur -- und welche Seiten zu welchem gehoeren.
// ---------------------------------------------------------------------------
// Neu sortiert am 24.10.2026 (Fassie: "alles so schwer zu finden"). Vorher
// lagen 16 Seiten in 9 Bereichen hinter dem Profilbild. Jetzt:
//
//   Unten (Handy) / oben (Desktop): Heute, Plan, Monate, Kunden -- das, was
//   taeglich gebraucht wird.
//   Alles andere auf der Seite "Mehr" (/mehr) in 7 Bereichen, jede Seite mit
//   einem Satz, der sagt, wofuer sie da ist. Zusammengehoerige Seiten haben
//   oben Reiter (BereichReiter), damit man nicht zurueck muss.
//
// Jeder Bereich kann spaeter einem Mitarbeiter zugeordnet werden: wer nur
// "analyse" hat, sieht in der Navigation nur die Analyse. Leer (null) heisst
// "sieht alles" -- der Normalfall fuer die Gruender. Das ist Uebersicht,
// keine Zugriffssperre: alle teilen sich einen Login.

export type BereichKey =
  | 'alltag' | 'produktion' | 'kunden' | 'geld' | 'analyse' | 'team' | 'system'

export interface Seite {
  to: string
  label: string
  /** Ein Satz: wofuer ist die Seite da? Steht auf "Mehr" und in der Suche. */
  was: string
  /** Suchwoerter fuer ⌘K, z. B. "Dropbox" fuer Medien. */
  suche?: string[]
  end?: boolean
  /** Reiter-Gruppe: Seiten mit gleichem Schluessel bekommen oben Reiter. */
  reiter?: string
}

export interface Bereich {
  key: BereichKey
  label: string
  /** Ein Satz, wofuer der Bereich da ist -- steht in den Team-Einstellungen. */
  zweck: string
  seiten: Seite[]
}

/** Die vier Hauptziele unten -- in dieser Reihenfolge, links zwei, rechts zwei. */
export const HAUPT_PFADE = ['/', '/plan', '/monate', '/kunden']

export const BEREICHE: Bereich[] = [
  { key: 'alltag', label: 'Alltag', zweck: 'Was heute und diese Woche dran ist',
    seiten: [
      { to: '/', label: 'Heute', was: 'Dein Tag: was jetzt dran ist, abhaken und weiter', end: true, suche: ['start', 'übersicht', 'fokus'] },
      { to: '/plan', label: 'Plan', was: 'Was wann rausgeht — die Seite, die der Kunde sieht', suche: ['posting', 'posts', 'kalender'] },
      { to: '/kalender', label: 'Kalender', was: 'Alle Termine, Drehtage und Aufgaben auf einen Blick', suche: ['termine', 'woche'] },
      { to: '/aufgaben', label: 'Aufgaben', was: 'Offene To-dos, Erinnerungen und wer was macht', suche: ['todo', 'erinnerung', 'tasks'] },
      { to: '/chat', label: 'Chat', was: 'Team-Chat mit Lion und Claude, Aufgaben direkt zuweisen', suche: ['nachrichten', 'anstupsen', 'claude'] },
    ] },
  { key: 'produktion', label: 'Produktion', zweck: 'Backstube, Videoideen und Formate',
    seiten: [
      { to: '/ofen', label: 'Backstube', was: 'Die Öfen: was gerade geschnitten wird, Bestellzettel, Teller, Bestellungen', suche: ['ofen', 'schnittofen', 'pizza', 'warteschlange', 'schnitt', 'produktion', 'vorschau', 'freigabe', 'medien'] },
      { to: '/lexikon', label: 'Lexikon', was: 'Formate und Videoideen je Branche — für jeden Kunden etwas aussuchen', suche: ['lexikon', 'formate', 'ideen', 'branche', 'fahrschule'] },
      { to: '/inspirationen', label: 'Inspirationen', was: 'Gespeicherte Videos anderer als Vorlage für eigene Ideen', suche: ['ideen', 'referenz', 'vorlage'] },
    ] },
  { key: 'kunden', label: 'Kunden & Vertrieb', zweck: 'Kundenakten, Verträge, neue Kunden gewinnen',
    seiten: [
      { to: '/kunden', label: 'Kunden', was: 'Alle Kundenakten: Verträge, Ideen, Termine, Zahlen je Kunde', reiter: 'kunden', suche: ['akte', 'vertrag', 'briefing'] },
      { to: '/brand', label: 'Personal Brand', was: 'Unsere eigenen Accounts: Posts, Analyse, Leads je Account', reiter: 'kunden', suche: ['eigen', 'agentur-account', 'sowloynab', 'personal brand', 'ads'] },
      { to: '/leads', label: 'Leads', was: 'Interessenten von der ersten Nachricht bis zum Vertrag', reiter: 'kunden', suche: ['akquise', 'pipeline', 'google maps', 'vertrieb'] },
    ] },
  { key: 'geld', label: 'Geld', zweck: 'Monate, Rechnungen, Konto',
    seiten: [
      { to: '/monate', label: 'Monate', was: 'Je Monat: wer wie viele Videos bekommt und was reinkommt', reiter: 'geld', suche: ['monat', 'abschließen', 'einnahmen'] },
      { to: '/rechnungen', label: 'Rechnungen', was: 'Rechnungen schreiben, als PDF senden, bezahlt abhaken', reiter: 'geld', suche: ['invoice', 'pdf', 'mahnung'] },
      { to: '/finanzen', label: 'Finanzen', was: 'Einnahmen, Ausgaben und Fixkosten vom Geschäftskonto', reiter: 'geld', suche: ['konto', 'ausgaben', 'buchungen', 'abos'] },
      { to: '/firma', label: 'Firmendaten', was: 'Steuernummer, USt-IdNr., Adresse, Bank — antippen und kopieren', reiter: 'geld', suche: ['steuernummer', 'ust-id', 'ustid', 'umsatzsteuer', 'adresse', 'iban', 'firma', 'finanzamt', 'unternehmensdaten'] },
    ] },
  { key: 'analyse', label: 'Analyse', zweck: 'Zahlen der geposteten Videos',
    seiten: [
      { to: '/analyse', label: 'Analyse', was: 'Was bei unseren Videos funktioniert: Views, beste Zeiten, Top-Videos', reiter: 'analyse', suche: ['statistik', 'views', 'reichweite', 'zahlen'] },
      { to: '/leistung', label: 'Leistung', was: 'Zahlen je Video nachtragen, wenn sie nicht automatisch kamen', reiter: 'analyse', suche: ['nachtragen', 'aufrufe', 'likes'] },
    ] },
  { key: 'team', label: 'Team', zweck: 'Wer gehört dazu, Postfach',
    seiten: [
      { to: '/team', label: 'Team', was: 'Mitglieder, wer welche Bereiche sieht, Kalender aufs Handy', suche: ['mitglieder', 'lion', 'bereiche'] },
      { to: '/postfach', label: 'Postfach', was: 'Agentur-Mails lesen und beantworten', suche: ['mail', 'e-mail', 'zoho'] },
    ] },
  { key: 'system', label: 'System', zweck: 'Einstellungen und Papierkorb',
    seiten: [
      { to: '/einstellungen', label: 'Einstellungen', was: 'Pakete, Caption-Vorgabe, Verbindungen, Systemstatus', suche: ['firma', 'pakete', 'passwort', 'bank', 'zoho', 'kategorien'] },
      { to: '/papierkorb', label: 'Papierkorb', was: 'Gelöschtes wiederherstellen', suche: ['gelöscht', 'wiederherstellen', 'trash'] },
    ] },
]

/** Alle Seiten flach -- fuer Suche und Reiter. */
export const ALLE_SEITEN: Seite[] = BEREICHE.flatMap((b) => b.seiten)

/** Bereich einer Seite (nach Pfad). */
export function bereichVon(pfad: string): Bereich | undefined {
  return BEREICHE.find((b) => b.seiten.some((s) => s.to === pfad))
}

/** Die Reiter-Nachbarn einer Seite (inkl. ihr selbst), leer wenn keine. */
export function reiterVon(pfad: string): Seite[] {
  const s = ALLE_SEITEN.find((x) => x.to === pfad)
  if (!s?.reiter) return []
  return ALLE_SEITEN.filter((x) => x.reiter === s.reiter)
}

/**
 * Alte Bereichsschluessel (vor dem 24.10.2026), die noch in team_members
 * stehen koennen -- auf die neuen abbilden, damit niemand Seiten verliert.
 */
const ALT: Record<string, BereichKey[]> = {
  posting: ['alltag'], vertrieb: ['kunden', 'alltag'], buchhaltung: ['geld'],
  kommunikation: ['alltag', 'team'], inhalte: ['produktion'], verwaltung: ['system', 'team'],
}

/**
 * Welche Bereiche sieht dieses Mitglied? null/leer = alle. System bleibt
 * immer erreichbar, sonst sperrt man sich die Einstellungen weg.
 */
export function sichtbareBereiche(erlaubt: string[] | null | undefined): Bereich[] {
  if (!erlaubt || erlaubt.length === 0) return BEREICHE
  const keys = new Set<string>()
  for (const k of erlaubt) for (const n of ALT[k] ?? [k]) keys.add(n)
  return BEREICHE.filter((b) => b.key === 'system' || keys.has(b.key))
}
