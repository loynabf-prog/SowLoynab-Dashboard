// iCalendar (.ics) bauen -- das Format, das iPhone, Google und Outlook lesen.
// ---------------------------------------------------------------------------
// Bewusst von Hand statt mit einer Bibliothek: wir schreiben nur konkrete
// Termine raus, keine Wiederholungsregeln. Das ist wenig Format und viel
// Kleinkram -- und genau der Kleinkram (Zeilenumbrueche, Sonderzeichen,
// Zeilenlaenge) ist das, woran fremde Kalender sonst ersticken.

export interface IcsTermin {
  /** Eindeutig und stabil -- sonst legt der Kalender bei jedem Abruf alles neu an. */
  uid: string
  titel: string
  /** "2026-10-14" */
  start: string
  /** Bei ganztaegig das Ende EXKLUSIV, also der Folgetag. Leer = ein Tag. */
  ende?: string | null
  /** "14:30" -- fehlt sie, ist der Termin ganztaegig. */
  startZeit?: string | null
  endZeit?: string | null
  ort?: string | null
  beschreibung?: string | null
}

/**
 * Sonderzeichen entschaerfen. Backslash zuerst, sonst wuerde er die
 * Maskierung der spaeter eingefuegten Zeichen wieder zerlegen.
 */
export function escape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Zeilen auf 75 Zeichen umbrechen, Fortsetzung mit einem Leerzeichen.
 * Steht so in der Norm; manche Kalender verschlucken sonst lange Titel.
 */
export function falte(zeile: string): string {
  if (zeile.length <= 75) return zeile
  const teile: string[] = [zeile.slice(0, 75)]
  let rest = zeile.slice(75)
  while (rest.length > 74) {
    teile.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) teile.push(' ' + rest)
  return teile.join('\r\n')
}

/** "2026-10-14" -> "20261014" */
export function datumKompakt(d: string): string {
  return d.replace(/-/g, '')
}

/** "2026-10-14" + "14:30" -> "20261014T143000" (lokale Zeit, ohne Zone) */
export function zeitKompakt(d: string, t: string): string {
  const [h, m] = t.split(':')
  return `${datumKompakt(d)}T${(h ?? '00').padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`
}

/** Ein Tag weiter -- ganztaegige Termine enden im ICS am FOLGETAG. */
export function tagDanach(d: string): string {
  const dt = new Date(d + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

function zeilen(t: IcsTermin, stempel: string, domain: string): string[] {
  const out = ['BEGIN:VEVENT', `UID:${t.uid}@${domain}`, `DTSTAMP:${stempel}`]

  if (t.startZeit) {
    out.push(`DTSTART;TZID=Europe/Berlin:${zeitKompakt(t.start, t.startZeit)}`)
    // Ohne Endzeit eine Stunde annehmen -- ein Termin ohne Dauer wird von
    // manchen Kalendern gar nicht erst angezeigt.
    const endeTag = t.ende || t.start
    const endeZeit = t.endZeit || plusStunde(t.startZeit)
    out.push(`DTEND;TZID=Europe/Berlin:${zeitKompakt(endeTag, endeZeit)}`)
  } else {
    out.push(`DTSTART;VALUE=DATE:${datumKompakt(t.start)}`)
    out.push(`DTEND;VALUE=DATE:${datumKompakt(tagDanach(t.ende || t.start))}`)
  }

  out.push(`SUMMARY:${escape(t.titel)}`)
  if (t.ort) out.push(`LOCATION:${escape(t.ort)}`)
  if (t.beschreibung) out.push(`DESCRIPTION:${escape(t.beschreibung)}`)
  out.push('END:VEVENT')
  return out
}

function plusStunde(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, (h ?? 0) + 1)).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
}

/**
 * Den fertigen Kalender bauen.
 *
 * `name` steht im iPhone als Kalendername. REFRESH-INTERVAL ist ein Wunsch,
 * kein Befehl -- iOS holt in eigenem Takt ab, meist alle paar Stunden.
 */
export function baueIcs(opts: {
  name: string
  termine: IcsTermin[]
  domain?: string
  stempel?: string
}): string {
  const domain = opts.domain ?? 'sowloynab.de'
  const stempel = opts.stempel ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const kopf = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sow & Loynab//Dashboard//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(opts.name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
  ]

  const koerper = opts.termine.flatMap((t) => zeilen(t, stempel, domain))
  return [...kopf, ...koerper, 'END:VCALENDAR'].map(falte).join('\r\n') + '\r\n'
}
