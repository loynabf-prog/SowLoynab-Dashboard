// Kalender-Kategorien: jede Kategorie hat ihre Farbe.
// Spalte = wessen Termin (Fassie / Lion / Agentur), Farbe = was es ist.

export type Kategorie = 'kunde' | 'sport' | 'privat' | 'ehrenamt' | 'uni' | 'arbeit' | 'termin'

export const KATEGORIEN: { key: Kategorie; name: string; farbe: string }[] = [
  { key: 'kunde', name: 'Kunde', farbe: '#ff6a1f' },
  { key: 'termin', name: 'Termin', farbe: '#30b0c7' },
  { key: 'sport', name: 'Sport', farbe: '#0a84ff' },
  { key: 'privat', name: 'Privat', farbe: '#af52de' },
  { key: 'ehrenamt', name: 'Ehrenamt', farbe: '#5ac8fa' },
  { key: 'uni', name: 'Uni', farbe: '#5856d6' },
  { key: 'arbeit', name: 'Arbeit', farbe: '#8e8e93' },
]

/** Kategorie eines Termins; alte Termine ohne Kategorie leiten sie aus "kind" bzw. Kunde ab. */
export function kategorieVon(t: { kategorie?: string | null; kind?: string | null; client_id?: string | null }): Kategorie {
  if (t.kategorie && KATEGORIEN.some((k) => k.key === t.kategorie)) return t.kategorie as Kategorie
  if (t.kind === 'spiel') return 'sport'
  if (t.kind === 'arbeit') return 'arbeit'
  if (t.client_id) return 'kunde'
  return 'termin'
}

export function farbeVon(t: Parameters<typeof kategorieVon>[0]): string {
  const k = kategorieVon(t)
  return KATEGORIEN.find((x) => x.key === k)!.farbe
}

// ---------------------------------------------------------- Terminfarbe
// Fassie (02.11.2026): Kundentermin = Farbe des Kunden (clients.brand_color,
// z. B. Hajo orange, Schleckofatz pink, Kraftfeld silber). Sport, Uni und
// Ehrenamt behalten ihre Kategoriefarbe. Alles andere nach wessen Termin:
// Fassie privat = schwarz, Lion = Navy, beide (Agentur) = dunkles Orange.
export const AGENTUR_FARBE = '#b5400c'
const PERSON_FARBE: Record<string, string> = { fassie: '#1d1d1f', lion: '#1b2a4e' }
const EIGENE_KATEGORIEN: Kategorie[] = ['sport', 'uni', 'ehrenamt']

export function terminFarbe(
  t: { kategorie?: string | null; kind?: string | null; client_id?: string | null; member_ids?: string[] | null; clients?: { brand_color?: string | null } | null },
  spuren: { key: string; name: string }[],
): string {
  if (t.clients?.brand_color) return t.clients.brand_color
  const k = kategorieVon(t)
  if (EIGENE_KATEGORIEN.includes(k)) return KATEGORIEN.find((x) => x.key === k)!.farbe
  const personen = spuren.filter((s) => s.key !== AGENTUR).map((s) => s.key)
  const spur = spurVon(t.member_ids, personen)
  if (spur === AGENTUR) return AGENTUR_FARBE
  const name = (spuren.find((s) => s.key === spur)?.name ?? '').toLowerCase()
  return PERSON_FARBE[name] ?? AGENTUR_FARBE
}

// ---------------------------------------------------------- Spuren & Tage
export const AGENTUR = 'agentur'
export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export interface Spur { key: string; name: string; farbe: string }

/** Zu welcher Spur gehoert ein Termin? Genau eine Person = deren Spur, sonst Agentur. */
export function spurVon(member_ids: string[] | null | undefined, personen: string[]): string {
  const ids = (member_ids ?? []).filter((m) => personen.includes(m))
  return ids.length === 1 ? ids[0] : AGENTUR
}

/** Liegt der Termin an diesem Tag? (mehrtaegige Termine eingeschlossen) */
export function liegtAn(t: { starts_on: string; ends_on: string | null }, tag: string): boolean {
  return t.starts_on <= tag && (t.ends_on ?? t.starts_on) >= tag
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function ausIso(s: string): Date { return new Date(s + 'T12:00:00') }
export function plus(s: string, n: number): string { const d = ausIso(s); d.setDate(d.getDate() + n); return iso(d) }
