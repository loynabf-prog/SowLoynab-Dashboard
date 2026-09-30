import { describe, it, expect } from 'vitest'
import { mengeFuer, istAusnahme } from '../monatsmenge'

describe('mengeFuer', () => {
  it('nimmt den Retainer, wenn es keine Ausnahme gibt', () => {
    expect(mengeFuer(16, '2026-10', new Map())).toBe(16)
  })
  it('die Ausnahme schlaegt den Retainer', () => {
    expect(mengeFuer(16, '2026-10', new Map([['2026-10', 20]]))).toBe(20)
  })
  it('eine Ausnahme gilt nur fuer ihren Monat', () => {
    const a = new Map([['2026-10', 20]])
    expect(mengeFuer(16, '2026-11', a)).toBe(16)
  })
  it('ohne Retainer sind es null', () => {
    expect(mengeFuer(null, '2026-10', new Map())).toBe(0)
  })
  it('eine Ausnahme auf null ist erlaubt -- Monat ohne Videos', () => {
    expect(mengeFuer(16, '2026-10', new Map([['2026-10', 0]]))).toBe(0)
  })
})

describe('istAusnahme', () => {
  it('gleiche Menge wie der Retainer ist keine Ausnahme', () => {
    expect(istAusnahme(16, '2026-10', new Map([['2026-10', 16]]))).toBe(false)
  })
  it('abweichende Menge schon', () => {
    expect(istAusnahme(16, '2026-10', new Map([['2026-10', 20]]))).toBe(true)
  })
  it('ohne Eintrag nicht', () => {
    expect(istAusnahme(16, '2026-10', new Map())).toBe(false)
  })
})
