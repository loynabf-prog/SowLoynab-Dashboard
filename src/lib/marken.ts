// Zwei Marken unter einem Dach. Die Trennung ist nicht nur Kosmetik: fuer
// Personenmarken entsteht anderer Content als fuer Gastronomie, deshalb
// sollen sich auch die Zahlen getrennt betrachten lassen.
export type Marke = 'media' | 'creator'

export interface MarkeInfo {
  key: Marke
  kurz: string
  lang: string
  icon: string
  hinweis: string
}

export const MARKEN: MarkeInfo[] = [
  { key: 'media', kurz: 'Sow & Loynab', lang: 'Sow & Loynab Media', icon: '🏢', hinweis: 'Unternehmen & Gastronomie' },
  { key: 'creator', kurz: 'Creator Scout', lang: 'Creator Scout', icon: '⭐', hinweis: 'Personenmarken & Creator' },
]

// Unbekanntes oder fehlendes Feld faellt auf "media" zurueck -- das war das
// Geschaeft, bevor es die Trennung gab.
export function markeVon(wert: string | null | undefined): Marke {
  return wert === 'creator' ? 'creator' : 'media'
}

export function markeInfo(wert: string | null | undefined): MarkeInfo {
  const k = markeVon(wert)
  return MARKEN.find((m) => m.key === k) ?? MARKEN[0]
}
