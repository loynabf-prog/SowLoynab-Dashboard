import { describe, it, expect } from 'vitest'
import { alsDatum, datumPlus, heute } from '../datum'

describe('alsDatum', () => {
  it('nimmt deutsche Zeit, nicht UTC -- der Fall aus der Nacht', () => {
    // 11.10.2026 23:45 UTC = 12.10.2026 01:45 in Deutschland (Sommerzeit)
    expect(alsDatum(new Date('2026-10-11T23:45:00Z'))).toBe('2026-10-12')
  })
  it('auch in der Winterzeit', () => {
    // 31.12.2026 23:30 UTC = 01.01.2027 00:30 in Deutschland (MEZ)
    expect(alsDatum(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })
  it('bleibt tagsueber beim selben Tag', () => {
    expect(alsDatum(new Date('2026-10-12T10:00:00Z'))).toBe('2026-10-12')
  })
  it('nimmt auch einen ISO-Text', () => {
    expect(alsDatum('2026-10-11T23:45:00Z')).toBe('2026-10-12')
  })
  it('gibt bei Unsinn einen leeren Text statt NaN', () => {
    expect(alsDatum('keinDatum')).toBe('')
  })
})

describe('heute', () => {
  it('liefert ein sauberes ISO-Datum', () => {
    expect(heute()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('datumPlus', () => {
  it('rechnet Tage drauf und ab', () => {
    expect(datumPlus('2026-10-12', 1)).toBe('2026-10-13')
    expect(datumPlus('2026-10-12', -1)).toBe('2026-10-11')
  })
  it('kommt ueber Monats- und Jahresgrenzen', () => {
    expect(datumPlus('2026-10-31', 1)).toBe('2026-11-01')
    expect(datumPlus('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('kommt ueber die Zeitumstellung', () => {
    // letzter Sonntag im Oktober 2026: Umstellung in der Nacht zum 25.
    expect(datumPlus('2026-10-24', 1)).toBe('2026-10-25')
    expect(datumPlus('2026-10-25', 1)).toBe('2026-10-26')
  })
})
