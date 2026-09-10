import type { Video } from './types'

// Wie weit ist ein Kunde diesen Monat? Die App zeigte bisher nur, was DA ist.
// Die eigentlich wichtige Zahl ist, was FEHLT — und zwar zweifach:
//   offen  = angelegt, aber noch nicht gepostet  -> Arbeit, die wartet
//   ohneIdee = laut Vertrag zugesagt, aber noch nicht mal angelegt
//              -> Arbeit, an die noch niemand gedacht hat
export interface Monatsplan {
  soll: number        // monthly_quota
  angelegt: number    // Videos, die diesem Monat zugeordnet sind
  gepostet: number
  offen: number       // angelegt - gepostet
  ohneIdee: number    // soll - angelegt (nie negativ)
  fertig: boolean
}

export function monatsKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Ein Video zaehlt zum Monat, wenn es dort geplant ODER dort gepostet wurde.
// Beides pruefen, sonst faellt ein Video durchs Raster, das ohne Termin
// angelegt und spontan gepostet wurde.
export function imMonat(v: Video, key = monatsKey()): boolean {
  return (v.scheduled_date ?? '').slice(0, 7) === key || (v.posted_at ?? '').slice(0, 7) === key
}

export function monatsplan(videos: Video[], quota: number | null, key = monatsKey()): Monatsplan {
  const soll = quota ?? 0
  const dazu = videos.filter((v) => imMonat(v, key))
  const angelegt = dazu.length
  const gepostet = dazu.filter((v) => v.status === 'posted').length
  return {
    soll,
    angelegt,
    gepostet,
    offen: Math.max(0, angelegt - gepostet),
    ohneIdee: Math.max(0, soll - angelegt),
    fertig: soll > 0 && gepostet >= soll,
  }
}
