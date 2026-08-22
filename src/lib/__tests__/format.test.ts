import { describe, it, expect } from 'vitest'
import { euro, dateRelative } from '../format'

describe('euro', () => {
  it('formatiert Beträge auf Deutsch', () => {
    expect(euro(1234.5)).toContain('1.234,50')
    expect(euro(1234.5)).toContain('€')
  })
  it('gibt — bei null/undefined', () => {
    expect(euro(null)).toBe('—')
    expect(euro(undefined)).toBe('—')
  })
})

describe('dateRelative', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  it('erkennt Heute', () => {
    expect(dateRelative(iso(new Date())).text).toBe('Heute')
  })
  it('markiert Vergangenes als überfällig', () => {
    const past = new Date(); past.setDate(past.getDate() - 3)
    expect(dateRelative(iso(past)).overdue).toBe(true)
  })
  it('markiert die nächsten Tage als „soon"', () => {
    const soon = new Date(); soon.setDate(soon.getDate() + 2)
    const r = dateRelative(iso(soon))
    expect(r.overdue).toBe(false)
    expect(r.soon).toBe(true)
  })
  it('kein Datum', () => {
    expect(dateRelative(null).text).toBe('kein Datum')
  })
})
