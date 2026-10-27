// Wofuer arbeiten wir hier eigentlich? Getrennt von der Frage, ob gerade
// Arbeit anliegt (das rechnet kundenrang.ts aus).
// 'eigen' = unsere Personal Brand (Agentur-Account + private Accounts):
// eigener Bereich, nicht in der Kundenliste, keine Einnahmen.
export type Kundenart = 'zahlend' | 'eigen' | 'referenz' | 'passiv'

export interface ArtInfo {
  key: Kundenart
  titel: string
  kurz: string
  icon: string
  hinweis: string
}

export const ARTEN: ArtInfo[] = [
  { key: 'zahlend',  titel: 'Zahlende Kunden',        kurz: 'Zahlend',  icon: '', hinweis: 'Bringt Umsatz — hat Vorrang' },
  { key: 'eigen',    titel: 'Personal Brand',         kurz: 'Eigen',    icon: '', hinweis: 'Unsere eigenen Accounts — eigener Bereich, nicht in der Kundenliste' },
  { key: 'referenz', titel: 'Ehrenamt & Referenzen',  kurz: 'Referenz', icon: '', hinweis: 'Ohne Honorar, für Portfolio oder gute Sache' },
  { key: 'passiv',   titel: 'Passiv',                 kurz: 'Passiv',   icon: '', hinweis: 'Abgeschlossen oder pausiert' },
]

export function artVon(wert: string | null | undefined): Kundenart {
  return wert === 'referenz' || wert === 'passiv' || wert === 'eigen' ? wert : 'zahlend'
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

/**
 * Prioritaet (kleiner = wichtiger): zahlende Kunden vor unserer Personal
 * Brand vor Ehrenamt/Referenz. Am Ende halten wir uns an alles -- aber wenn
 * zwei Dinge gleichzeitig brennen, kommt das vertraglich Versprochene zuerst.
 */
export const RANG: Record<Kundenart, number> = { zahlend: 0, eigen: 1, referenz: 2, passiv: 3 }
export function rangVon(wert: string | null | undefined): number {
  return RANG[artVon(wert)]
}

/** Arten, die in der normalen Kundenliste stehen (Personal Brand hat einen eigenen Bereich). */
export const KUNDEN_ARTEN: ArtInfo[] = ARTEN.filter((a) => a.key !== 'eigen')
