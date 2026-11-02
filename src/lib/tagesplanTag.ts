// Welcher Tag steht beim Oeffnen im Tagesplan auf Heute?
//
// Ab 20 Uhr brauchen wir den heutigen Tag nicht mehr -- ausser es laeuft noch
// ein Termin oder einer kommt noch. Dann zeigt der Tagesplan direkt morgen
// (Fassie, 02.11.2026).
import { ZEITZONE, datumPlus } from './datum'
import { liegtAn } from './kalender'

export const ABEND_AB = 20 * 60

interface TerminZeit { starts_on: string; ends_on: string | null; starts_at: string | null; ends_at: string | null }

function minuten(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

/** Aktuelle Uhrzeit in deutscher Zeit als Minuten seit Mitternacht. */
export function jetztMinuten(d: Date = new Date()): number {
  const p: Record<string, string> = {}
  for (const t of new Intl.DateTimeFormat('en-GB', { timeZone: ZEITZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)) p[t.type] = t.value
  return Number(p.hour) * 60 + Number(p.minute)
}

/** Laeuft heute noch ein Termin oder kommt noch einer? Ganztaegige zaehlen nicht. */
export function nochTerminHeute(termine: TerminZeit[], heute: string, jetzt: number): boolean {
  return termine.some((t) => {
    if (!liegtAn(t, heute)) return false
    if ((t.ends_on ?? t.starts_on) > heute && t.starts_at) return true // geht ueber Mitternacht hinaus
    const a = minuten(t.starts_at)
    if (a === null) return false
    const z = minuten(t.ends_at) ?? a + 60
    return z > jetzt
  })
}

/** Tag fuer den Tagesplan: ab 20 Uhr ohne aktiven Termin morgen, sonst heute. */
export function tagesplanTag(termine: TerminZeit[], heute: string, jetzt: number): string {
  if (jetzt < ABEND_AB) return heute
  return nochTerminHeute(termine, heute, jetzt) ? heute : datumPlus(heute, 1)
}
