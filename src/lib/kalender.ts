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
