// Wofuer arbeiten wir hier eigentlich? Getrennt von der Frage, ob gerade
// Arbeit anliegt (das rechnet kundenrang.ts aus).
export type Kundenart = 'zahlend' | 'referenz' | 'passiv'

export interface ArtInfo {
  key: Kundenart
  titel: string
  kurz: string
  icon: string
  hinweis: string
}

export const ARTEN: ArtInfo[] = [
  { key: 'zahlend',  titel: 'Zahlende Kunden',        kurz: 'Zahlend',  icon: '💶', hinweis: 'Bringt Umsatz — hat Vorrang' },
  { key: 'referenz', titel: 'Ehrenamt & Referenzen',  kurz: 'Referenz', icon: '🤝', hinweis: 'Ohne Honorar, für Portfolio oder gute Sache' },
  { key: 'passiv',   titel: 'Passiv',                 kurz: 'Passiv',   icon: '💤', hinweis: 'Abgeschlossen oder pausiert' },
]

export function artVon(wert: string | null | undefined): Kundenart {
  return wert === 'referenz' || wert === 'passiv' ? wert : 'zahlend'
}

export function artInfo(wert: string | null | undefined): ArtInfo {
  const k = artVon(wert)
  return ARTEN.find((a) => a.key === k) ?? ARTEN[0]
}

// "Aktiv" ist keine eigene Entscheidung mehr, sondern folgt der Art --
// ein passiver Kunde zaehlt nicht zu den laufenden Einnahmen.
export function istAktiv(art: Kundenart): boolean {
  return art !== 'passiv'
}
