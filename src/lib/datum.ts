// Unser "heute" ist deutsche Zeit, nicht UTC.
//
// Bisher stand ueberall new Date().toISOString().slice(0,10). Das ist UTC --
// und zwischen Mitternacht und 2 Uhr (im Winter 1 Uhr) deutscher Zeit ist in
// UTC noch der Vortag. Wer nachts um halb zwei einen Vertrag anlegt, eine
// Rechnung schreibt oder ein Video einplant, bekommt dann das falsche Datum.
// Genau so passiert: ein Vertrag, erstellt am 12.10. um 01:45, trug den 11.10.
export const ZEITZONE = 'Europe/Berlin'

const TEILE = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZEITZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Beliebigen Zeitpunkt als Datum in deutscher Zeit: "2026-10-12".
export function alsDatum(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const p: Record<string, string> = {}
  for (const t of TEILE.formatToParts(dt)) p[t.type] = t.value
  return `${p.year}-${p.month}-${p.day}`
}

// Das heutige Datum in deutscher Zeit.
export function heute(): string {
  return alsDatum(new Date())
}

// Tage auf ein Datum rechnen, ohne ueber die Zeitzone zu stolpern.
export function datumPlus(iso: string, tage: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}
