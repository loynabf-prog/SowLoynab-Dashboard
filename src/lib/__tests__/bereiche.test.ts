import { describe, it, expect } from 'vitest'
import { ALLE_SEITEN, BEREICHE, HAUPT_PFADE, reiterVon, sichtbareBereiche } from '../bereiche'

describe('sichtbareBereiche', () => {
  it('ohne Zuordnung sieht man alles', () => {
    expect(sichtbareBereiche(null)).toHaveLength(BEREICHE.length)
    expect(sichtbareBereiche([])).toHaveLength(BEREICHE.length)
  })
  it('mit Zuordnung nur die eigenen plus System', () => {
    expect(sichtbareBereiche(['analyse']).map((b) => b.key)).toEqual(['analyse', 'system'])
  })
  it('alte Schluessel werden abgebildet', () => {
    expect(sichtbareBereiche(['buchhaltung']).map((b) => b.key)).toEqual(['geld', 'system'])
  })
  it('jede Seite gehoert zu genau einem Bereich', () => {
    const alle = BEREICHE.flatMap((b) => b.seiten.map((s) => s.to))
    expect(new Set(alle).size).toBe(alle.length)
  })
  it('jede Seite hat einen Satz', () => {
    for (const s of ALLE_SEITEN) expect(s.was.length).toBeGreaterThan(10)
  })
  it('Hauptziele sind eingetragen', () => {
    for (const p of HAUPT_PFADE) expect(ALLE_SEITEN.some((s) => s.to === p)).toBe(true)
  })
  it('Reiter: Geld haengt Monate, Rechnungen, Finanzen, Firmendaten zusammen', () => {
    expect(reiterVon('/rechnungen').map((s) => s.to)).toEqual(['/monate', '/rechnungen', '/finanzen', '/firma'])
    expect(reiterVon('/kalender')).toEqual([])
  })
})
