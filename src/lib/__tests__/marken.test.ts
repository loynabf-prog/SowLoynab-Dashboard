import { describe, expect, it } from 'vitest'
import { markeInfo, markeVon, MARKEN } from '../marken'

describe('markeVon', () => {
  it('erkennt beide Marken', () => {
    expect(markeVon('creator')).toBe('creator')
    expect(markeVon('media')).toBe('media')
  })
  it('faellt auf media zurueck -- auch bei leerem oder unbekanntem Wert', () => {
    expect(markeVon(null)).toBe('media')
    expect(markeVon(undefined)).toBe('media')
    expect(markeVon('')).toBe('media')
    expect(markeVon('irgendwas')).toBe('media')
  })
})

describe('markeInfo', () => {
  it('liefert die Anzeigedaten', () => {
    expect(markeInfo('creator').lang).toBe('Creator Scout')
    expect(markeInfo('media').lang).toBe('Sow & Loynab Media')
  })
  it('liefert auch bei Unsinn etwas Anzeigbares', () => {
    expect(markeInfo('quatsch').key).toBe('media')
  })
})

describe('MARKEN', () => {
  it('hat genau zwei Eintraege mit eindeutigen Schluesseln', () => {
    expect(MARKEN).toHaveLength(2)
    expect(new Set(MARKEN.map((m) => m.key)).size).toBe(2)
  })
})
