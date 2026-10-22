// Befehle im Team-Chat.
// ---------------------------------------------------------------------------
// Der Chat soll mehr koennen als Text hin und her: aus einer Zeile wird eine
// echte Aufgabe, und Claude liest mit, wenn man ihn ruft.
//
//   /aufgabe @Lion Rechnung Kebab Kumpels bis Freitag
//   /a @Lion Drehtag BelChicken klaeren morgen 14 Uhr dringend
//   @claude was brennt diese Woche?
//   /claude leg Fahrschule Hajo im November 8 Videos an
//
// Alles hier ist reine Textarbeit ohne Datenbank -- damit es sich testen
// laesst. Was davon wirklich angelegt wird, entscheidet die Chat-Seite.

import { datumPlus } from './datum'

export interface Person { id: string; name: string }

export type Befehl =
  | { art: 'text' }
  | { art: 'claude'; frage: string }
  | {
      art: 'aufgabe'
      titel: string
      wer: string[]
      datum: string | null
      uhrzeit: string | null
      prioritaet: 1 | 2 | 3
    }

/** Was im Eingabefeld beim Tippen von "/" vorgeschlagen wird. */
export const BEFEHLE = [
  { kurz: '/aufgabe', beispiel: '/aufgabe @Lion Rechnung schreiben bis Freitag', text: 'Aufgabe anlegen und zuweisen' },
  { kurz: '/claude', beispiel: '/claude was brennt diese Woche?', text: 'Claude fragen oder etwas anlegen lassen' },
]

const WOCHENTAGE: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
}

/** Wochentag eines ISO-Datums (0 = Sonntag), zeitzonensicher. */
function wochentag(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getUTCDay()
}

/** Naechster genannter Wochentag -- heute zaehlt nicht, "Freitag" am Freitag ist der naechste. */
export function naechsterWochentag(heute: string, ziel: number): string {
  const diff = ((ziel - wochentag(heute) + 7) % 7) || 7
  return datumPlus(heute, diff)
}

/** "25.10." / "25.10.2026" / "25.10.26" -> ISO. Ohne Jahr: das naechste Vorkommen ab heute. */
function tagMonat(t: number, m: number, j: number | null, heute: string): string | null {
  if (t < 1 || t > 31 || m < 1 || m > 12) return null
  const jahrHeute = Number(heute.slice(0, 4))
  let jahr = j == null ? jahrHeute : j < 100 ? 2000 + j : j
  const iso = (y: number) => `${y}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`
  // Gibt es den Tag ueberhaupt (31.11.)?
  const pruef = (y: number) => {
    const d = new Date(iso(y) + 'T12:00:00Z')
    return d.getUTCMonth() + 1 === m ? iso(y) : null
  }
  if (j == null && iso(jahr) < heute) jahr += 1
  return pruef(jahr)
}

/**
 * Datum und Uhrzeit aus einer Zeile ziehen. Gibt den Rest ohne die erkannten
 * Woerter zurueck, damit der Aufgabentitel sauber bleibt.
 */
export function zieheTermin(text: string, heute: string): { rest: string; datum: string | null; uhrzeit: string | null } {
  let rest = ` ${text} `
  let datum: string | null = null
  let uhrzeit: string | null = null

  const weg = (re: RegExp, f: (m: RegExpMatchArray) => boolean) => {
    const m = rest.match(re)
    if (m && f(m)) rest = rest.replace(m[0], ' ')
  }

  // Uhrzeit: "14:30", "14.30 Uhr", "um 9 Uhr", "14 Uhr"
  weg(/\s(?:um\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*uhr)?(?=\s|[,.!?]|$)/i, (m) => {
    uhrzeit = `${m[1].padStart(2, '0')}:${m[2]}`
    return true
  })
  if (!uhrzeit) {
    weg(/\s(?:um\s+)?([01]?\d|2[0-3])\s*uhr(?=\s|[,.!?]|$)/i, (m) => {
      uhrzeit = `${m[1].padStart(2, '0')}:00`
      return true
    })
  }

  const vorsatz = '(?:bis\\s+(?:zum\\s+|spätestens\\s+)?|am\\s+|zum\\s+|spätestens\\s+|ab\\s+)?'

  // Datum mit Punkten: "25.10.", "25.10.2026"
  weg(new RegExp(`\\s${vorsatz}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?(?=\\s|[,!?]|$)`, 'i'), (m) => {
    const d = tagMonat(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, heute)
    if (d) datum = d
    return !!d
  })

  if (!datum) {
    weg(new RegExp(`\\s${vorsatz}(heute|übermorgen|uebermorgen|morgen)(?=\\s|[,.!?]|$)`, 'i'), (m) => {
      const w = m[1].toLowerCase()
      datum = w === 'heute' ? heute : w === 'morgen' ? datumPlus(heute, 1) : datumPlus(heute, 2)
      return true
    })
  }

  if (!datum) {
    weg(/\s(?:in\s+)?(\d{1,2})\s+tag(?:en)?(?=\s|[,.!?]|$)/i, (m) => {
      datum = datumPlus(heute, Number(m[1]))
      return true
    })
  }

  if (!datum) {
    weg(/\s(?:bis\s+)?(?:nächste|naechste|kommende)\s+woche(?=\s|[,.!?]|$)/i, () => {
      datum = naechsterWochentag(heute, 1)
      return true
    })
  }

  if (!datum) {
    weg(
      new RegExp(`\\s${vorsatz}(?:nächsten\\s+|naechsten\\s+|kommenden\\s+|diesen\\s+)?(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)(?=\\s|[,.!?]|$)`, 'i'),
      (m) => {
        datum = naechsterWochentag(heute, WOCHENTAGE[m[1].toLowerCase()])
        return true
      },
    )
  }

  // Uhrzeit ohne Datum heisst: heute
  if (uhrzeit && !datum) datum = heute

  return { rest: rest.replace(/\s+/g, ' ').trim(), datum, uhrzeit }
}

/** @Namen herausziehen. "@alle" = niemand ausdruecklich (= alle). */
export function zieheErwaehnte(text: string, personen: Person[]): { rest: string; wer: string[]; claude: boolean } {
  const wer: string[] = []
  let claude = false
  const rest = text.replace(/@([\p{L}\p{N}_-]+)/gu, (ganz, name: string) => {
    const n = name.toLowerCase()
    if (n === 'claude') { claude = true; return ' ' }
    if (n === 'alle' || n === 'team') return ' '
    const p = personen.find((x) => x.name.toLowerCase() === n)
      ?? personen.find((x) => x.name.toLowerCase().split(/\s+/)[0] === n)
      ?? personen.find((x) => x.name.toLowerCase().startsWith(n))
    if (!p) return ganz
    if (!wer.includes(p.id)) wer.push(p.id)
    return ' '
  })
  return { rest: rest.replace(/\s+/g, ' ').trim(), wer, claude }
}

/** Eine Chatzeile deuten. */
export function deuteZeile(zeile: string, personen: Person[], heute: string): Befehl {
  const text = zeile.trim()
  const befehl = text.match(/^\/(\S+)\s*([\s\S]*)$/)

  if (befehl) {
    const name = befehl[1].toLowerCase()
    const inhalt = befehl[2].trim()
    if (name === 'claude' || name === 'c') return { art: 'claude', frage: inhalt }
    if (name === 'aufgabe' || name === 'a' || name === 'todo') {
      let prioritaet: 1 | 2 | 3 = 1
      let r = ` ${inhalt} `
      if (/\s(dringend|asap|sofort)(?=\s|[,.!?]|$)/i.test(r) || /!!/.test(r)) prioritaet = 3
      else if (/\swichtig(?=\s|[,.!?]|$)/i.test(r) || /\s!(?=\s|$)/.test(r)) prioritaet = 2
      r = r.replace(/\s(dringend|asap|sofort|wichtig)(?=\s|[,.!?]|$)/gi, ' ').replace(/!+/g, ' ')

      const m = zieheErwaehnte(r, personen)
      const t = zieheTermin(m.rest, heute)
      const titel = t.rest.replace(/^[-–:,\s]+|[-–:,\s]+$/g, '').trim()
      return {
        art: 'aufgabe',
        titel: titel ? titel.charAt(0).toUpperCase() + titel.slice(1) : '',
        wer: m.wer,
        datum: t.datum,
        uhrzeit: t.uhrzeit,
        prioritaet,
      }
    }
    // unbekannter Befehl -> als normaler Text behandeln
    return { art: 'text' }
  }

  if (/(^|\s)@claude\b/i.test(text)) {
    return { art: 'claude', frage: text.replace(/@claude\b/gi, '').replace(/\s+/g, ' ').trim() }
  }
  return { art: 'text' }
}

/** Kurzes Datum fuer Karten: "heute", "morgen", "Fr 24.10." */
export function datumAnzeige(iso: string | null, heute: string): string {
  if (!iso) return ''
  if (iso === heute) return 'heute'
  if (iso === datumPlus(heute, 1)) return 'morgen'
  if (iso === datumPlus(heute, -1)) return 'gestern'
  const tage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return `${tage[wochentag(iso)]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`
}
