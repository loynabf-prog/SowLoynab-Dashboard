import { describe, it, expect } from 'vitest'
import { BEREICHE, sichtbareBereiche } from '../bereiche'

describe('sichtbareBereiche', () => {
  it('ohne Zuordnung sieht man alles', () => {
    expect(sichtbareBereiche(null)).toHaveLength(BEREICHE.length)
    expect(sichtbareBereiche([])).toHaveLength(BEREICHE.length)
  })
  it('mit Zuordnung nur die eigenen plus Verwaltung', () => {
    expect(sichtbareBereiche(['analyse']).map((b) => b.key)).toEqual(['analyse', 'verwaltung'])
  })
  it('jede Seite gehoert zu genau einem Bereich', () => {
    const alle = BEREICHE.flatMap((b) => b.seiten.map((s) => s.to))
    expect(new Set(alle).size).toBe(alle.length)
  })
})
