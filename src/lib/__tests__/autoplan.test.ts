import { describe, expect, it } from 'vitest'
import { hoechsteNummer, istPlatzhalter, monatsName, verteilePlan } from '../autoplan'

describe('monatsName', () => {
  it('macht aus dem Schluessel den deutschen Monat', () => {
    expect(monatsName('2026-09')).toBe('September')
    expect(monatsName('2026-01')).toBe('Januar')
    expect(monatsName('2026-12')).toBe('Dezember')
  })
})

describe('istPlatzhalter', () => {
  it('erkennt automatisch vergebene Namen', () => {
    expect(istPlatzhalter('September 7')).toBe(true)
    expect(istPlatzhalter('  März 12 ')).toBe(true)
  })
  it('laesst echte Ideen in Ruhe', () => {
    expect(istPlatzhalter('Pasta-Reel')).toBe(false)
    expect(istPlatzhalter('September Special')).toBe(false)
    expect(istPlatzhalter('Video 3')).toBe(false)
  })
})

describe('hoechsteNummer', () => {
  it('zaehlt nach dem zweiten Durchlauf weiter statt neu', () => {
    expect(hoechsteNummer(['September 1', 'September 5', 'Pasta-Reel'], '2026-09')).toBe(5)
  })
  it('ignoriert Namen aus anderen Monaten', () => {
    expect(hoechsteNummer(['August 9'], '2026-09')).toBe(0)
  })
  it('faengt bei nichts Vorhandenem bei 0 an', () => {
    expect(hoechsteNummer([], '2026-09')).toBe(0)
  })
})

describe('verteilePlan', () => {
  it('legt die gewuenschte Menge an', () => {
    const r = verteilePlan({ anzahl: 5, monatsKey: '2026-09', abTag: '2026-09-10', belegteTage: [], vorhandeneTitel: [] })
    expect(r).toHaveLength(5)
  })
  it('benennt fortlaufend ab der hoechsten vorhandenen Nummer', () => {
    const r = verteilePlan({
      anzahl: 3, monatsKey: '2026-09', abTag: '2026-09-10',
      belegteTage: [], vorhandeneTitel: ['September 1', 'September 2'],
    })
    expect(r.map((x) => x.title)).toEqual(['September 3', 'September 4', 'September 5'])
  })
  it('bleibt im Monat und nicht vor dem Starttag', () => {
    const r = verteilePlan({ anzahl: 4, monatsKey: '2026-09', abTag: '2026-09-20', belegteTage: [], vorhandeneTitel: [] })
    for (const z of r) {
      expect(z.scheduled_date >= '2026-09-20').toBe(true)
      expect(z.scheduled_date <= '2026-09-30').toBe(true)
    }
  })
  it('ueberspringt Tage, an denen schon ein Video liegt', () => {
    const belegt = ['2026-09-10', '2026-09-11', '2026-09-12']
    const r = verteilePlan({ anzahl: 3, monatsKey: '2026-09', abTag: '2026-09-10', belegteTage: belegt, vorhandeneTitel: [] })
    for (const z of r) expect(belegt).not.toContain(z.scheduled_date)
  })
  it('verteilt gleichmaessig statt alles auf einen Tag', () => {
    const r = verteilePlan({ anzahl: 4, monatsKey: '2026-09', abTag: '2026-09-01', belegteTage: [], vorhandeneTitel: [] })
    const tage = new Set(r.map((x) => x.scheduled_date))
    expect(tage.size).toBe(4)
    expect(r[0].scheduled_date).toBe('2026-09-01')
    expect(r[3].scheduled_date).toBe('2026-09-30')
  })
  it('legt lieber doppelt an, als Videos wegzulassen', () => {
    const r = verteilePlan({ anzahl: 4, monatsKey: '2026-09', abTag: '2026-09-29', belegteTage: [], vorhandeneTitel: [] })
    expect(r).toHaveLength(4)
  })
  it('macht bei null nichts', () => {
    expect(verteilePlan({ anzahl: 0, monatsKey: '2026-09', abTag: '2026-09-10', belegteTage: [], vorhandeneTitel: [] })).toEqual([])
  })
})
