import { describe, it, expect } from 'vitest'
import { occurrences, describeRule, mondayDow } from '../recurrence'

describe('occurrences', () => {
  it('einmalig gibt nur den Ankertag', () => {
    expect(occurrences('2026-08-24', { kind: 'none' })).toEqual(['2026-08-24'])
  })

  it('alle 3 Tage bis Enddatum', () => {
    const r = occurrences('2026-08-01', { kind: 'days', interval: 3, until: '2026-08-10' })
    expect(r).toEqual(['2026-08-01', '2026-08-04', '2026-08-07', '2026-08-10'])
  })

  it('wöchentlich an Mo & Mi (0,2)', () => {
    // 2026-08-24 ist ein Montag
    const r = occurrences('2026-08-24', { kind: 'weekly', weekdays: [0, 2], until: '2026-09-02' })
    expect(r).toEqual(['2026-08-24', '2026-08-26', '2026-08-31', '2026-09-02'])
  })

  it('wöchentlich ohne Angabe nimmt den Wochentag des Ankers', () => {
    const r = occurrences('2026-08-24', { kind: 'weekly', until: '2026-09-14' })
    expect(r).toEqual(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'])
  })

  it('monatlich am selben Tag', () => {
    const r = occurrences('2026-01-15', { kind: 'monthly', interval: 1, until: '2026-04-15' })
    expect(r).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
  })

  it('monatlich klemmt den 31. auf Monatsende', () => {
    const r = occurrences('2026-01-31', { kind: 'monthly', interval: 1, until: '2026-03-31' })
    expect(r).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('unbegrenzt nutzt den Horizont und respektiert max', () => {
    const r = occurrences('2026-01-01', { kind: 'days', interval: 1, until: null }, { horizonDays: 5 })
    expect(r).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'])
    const capped = occurrences('2026-01-01', { kind: 'days', interval: 1, until: null }, { horizonDays: 9999, max: 10 })
    expect(capped).toHaveLength(10)
  })
})

describe('describeRule', () => {
  it('beschreibt Muster lesbar', () => {
    expect(describeRule({ kind: 'none' })).toBe('Einmalig')
    expect(describeRule({ kind: 'days', interval: 3 })).toBe('Alle 3 Tage')
    expect(describeRule({ kind: 'weekly', weekdays: [0, 2] })).toBe('Wöchentlich: Mo, Mi')
  })
})

describe('mondayDow', () => {
  it('Montag = 0, Sonntag = 6', () => {
    expect(mondayDow(new Date('2026-08-24T00:00:00'))).toBe(0)
    expect(mondayDow(new Date('2026-08-23T00:00:00'))).toBe(6)
  })
})
