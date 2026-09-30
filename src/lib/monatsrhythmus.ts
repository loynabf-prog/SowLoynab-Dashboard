// Den Monat verplanen: wie viele Videos, in welchem Abstand, ab wann.
// ---------------------------------------------------------------------------
// Alles, was wir tun, laeuft auf Monatsbasis. Der Normalfall ist immer
// derselbe: eine zugesagte Menge gleichmaessig ueber den Monat verteilen.
// 10 Videos im Oktober heisst: am 1., am 4., am 7. — immer drei Tage
// Abstand. Mehr braucht es meistens nicht.
//
// Zwei Rhythmen reichen deshalb:
//   gleichmaessig  – fester Abstand ab einem Starttag (der Normalfall)
//   wochentage     – feste Wochentage, z. B. Di und Do
//
// Einzelne Termine verschiebt man hinterher an der Videokarte. Dafuer
// braucht es hier keine dritte Betriebsart.

const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

export type Rhythmus = 'gleichmaessig' | 'wochentage'

/** "2026-10" -> "Oktober 2026" */
export function monatsTitel(key: string): string {
  const m = Number(key.slice(5, 7))
  return `${MONATE[m - 1] ?? key} ${key.slice(0, 4)}`
}

/** Monats-Schluessel um n Monate verschieben. */
export function monatVersetzt(key: string, n: number): string {
  const jahr = Number(key.slice(0, 4))
  const monat = Number(key.slice(5, 7))
  const d = new Date(jahr, monat - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function tageImMonat(key: string): number {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate()
}

const iso = (jahr: number, monat: number, tag: number) =>
  `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`

/**
 * Welcher Abstand passt fuer diese Menge?
 *
 * Zwei Bedingungen: moeglichst nah am rechnerisch gleichmaessigen Abstand
 * (Tage geteilt durch Anzahl), aber nie so gross, dass die letzten Videos
 * aus dem Monat fallen. Bei 10 Videos im Oktober kommt 3 heraus, bei 16
 * eine 2.
 */
export function vorschlagAbstand(key: string, anzahl: number, startTag = 1): number {
  if (anzahl <= 1) return 1
  const tage = tageImMonat(key)
  const ideal = Math.round(tage / anzahl)
  const maximal = Math.floor((tage - startTag) / (anzahl - 1))
  return Math.max(1, Math.min(ideal, maximal))
}

/**
 * Termine im festen Abstand.
 *
 * Gibt nur Tage zurueck, die noch in den Monat fallen. Passt die Menge bei
 * diesem Abstand nicht mehr hinein, kommen weniger Termine zurueck als
 * gefordert -- das Fenster zeigt das an, statt heimlich etwas anderes zu
 * tun, als dasteht.
 */
export function gleichmaessigeTermine(opts: {
  monatsKey: string
  anzahl: number
  startTag: number
  abstand: number
}): string[] {
  const { monatsKey, anzahl } = opts
  const abstand = Math.max(1, Math.floor(opts.abstand))
  const startTag = Math.max(1, Math.floor(opts.startTag))
  if (anzahl <= 0) return []

  const jahr = Number(monatsKey.slice(0, 4))
  const monat = Number(monatsKey.slice(5, 7))
  const letzter = tageImMonat(monatsKey)

  const out: string[] = []
  for (let i = 0; i < anzahl; i++) {
    const tag = startTag + i * abstand
    if (tag > letzter) break
    out.push(iso(jahr, monat, tag))
  }
  return out
}

/**
 * Termine an festen Wochentagen.
 *
 * `tage` sind Indizes 0 = Montag … 6 = Sonntag. Es werden hoechstens
 * `anzahl` Termine zurueckgegeben -- der Monat bestimmt, wie viele
 * ueberhaupt zusammenkommen.
 */
export function wochentagTermine(opts: {
  monatsKey: string
  anzahl: number
  tage: number[]
  abTag?: number
}): string[] {
  const { monatsKey, anzahl, tage } = opts
  if (anzahl <= 0 || tage.length === 0) return []

  const jahr = Number(monatsKey.slice(0, 4))
  const monat = Number(monatsKey.slice(5, 7))
  const letzter = tageImMonat(monatsKey)
  const ab = Math.max(1, opts.abTag ?? 1)
  const gesucht = new Set(tage)

  const out: string[] = []
  for (let tag = ab; tag <= letzter && out.length < anzahl; tag++) {
    // getDay(): 0 = Sonntag. Wir rechnen 0 = Montag, weil die Woche hier
    // am Montag anfaengt.
    const wt = (new Date(jahr, monat - 1, tag).getDay() + 6) % 7
    if (gesucht.has(wt)) out.push(iso(jahr, monat, tag))
  }
  return out
}

/** Kurzfassung der Termine fuer die Vorschau: "1., 4., 7., 10. …" */
export function terminVorschau(termine: string[], hoechstens = 6): string {
  const tage = termine.map((t) => `${Number(t.slice(8, 10))}.`)
  if (tage.length <= hoechstens) return tage.join(', ')
  return tage.slice(0, hoechstens).join(', ') + ' … ' + tage[tage.length - 1]
}

/**
 * Fortlaufende Platzhalter-Namen ("Oktober 1", "Oktober 2" …).
 *
 * Bewusst ein Platzhalter und keine erfundene Idee: die Karte steht im
 * Board, damit die Menge stimmt -- die Idee traegt der Mensch nach.
 */
export function platzhalterNamen(monatsKey: string, anzahl: number, abNummer = 0): string[] {
  const name = MONATE[Number(monatsKey.slice(5, 7)) - 1] ?? monatsKey
  return Array.from({ length: anzahl }, (_, i) => `${name} ${abNummer + i + 1}`)
}
