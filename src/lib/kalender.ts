// Kalender-Kategorien: jede Kategorie hat ihre Farbe.
// Spalte = wessen Termin (Fassie / Lion / Agentur), Farbe = was es ist.

export type Kategorie = 'kunde' | 'sport' | 'privat' | 'ehrenamt' | 'uni' | 'arbeit' | 'termin'

export const KATEGORIEN: { key: Kategorie; name: string; farbe: string }[] = [
  { key: 'kunde', name: 'Kunde', farbe: '#ff6a1f' },
  { key: 'termin', name: 'Termin', farbe: '#30b0c7' },
  { key: 'sport', name: 'Sport', farbe: '#0a84ff' },
  { key: 'privat', name: 'Privat', farbe: '#af52de' },
  { key: 'ehrenamt', name: 'Ehrenamt', farbe: '#34c759' },
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
