import { describe, expect, it } from 'vitest'
import { ARTEN, KUNDEN_ARTEN, artInfo, artVon, istAktiv, rangVon } from '../kundenart'

describe('artVon', () => {
  it('erkennt alle drei Arten', () => {
    expect(artVon('zahlend')).toBe('zahlend')
    expect(artVon('referenz')).toBe('referenz')
    expect(artVon('passiv')).toBe('passiv')
  })
  it('faellt auf zahlend zurueck -- Bestandskunden waren alle zahlend', () => {
    expect(artVon(null)).toBe('zahlend')
    expect(artVon(undefined)).toBe('zahlend')
    expect(artVon('quatsch')).toBe('zahlend')
  })
})

describe('istAktiv', () => {
  it('nur passiv zaehlt nicht zu den Einnahmen', () => {
    expect(istAktiv('zahlend')).toBe(true)
    expect(istAktiv('referenz')).toBe(true)
    expect(istAktiv('passiv')).toBe(false)
  })
})

describe('ARTEN', () => {
  it('hat vier Eintraege in der Reihenfolge der Wichtigkeit', () => {
    expect(ARTEN.map((a) => a.key)).toEqual(['zahlend', 'eigen', 'referenz', 'passiv'])
  })
  it('Kundenliste ohne Personal Brand', () => {
    expect(KUNDEN_ARTEN.map((a) => a.key)).toEqual(['zahlend', 'referenz', 'passiv'])
  })
  it('Rang: zahlend vor eigen vor Ehrenamt; Unbekanntes zaehlt als zahlend', () => {
    expect(rangVon('zahlend')).toBeLessThan(rangVon('eigen'))
    expect(rangVon('eigen')).toBeLessThan(rangVon('referenz'))
    expect(rangVon(null)).toBe(rangVon('zahlend'))
    expect(artVon('eigen')).toBe('eigen')
  })
  it('liefert zu jedem Wert etwas Anzeigbares', () => {
    expect(artInfo('referenz').titel).toBe('Ehrenamt & Referenzen')
    expect(artInfo(null).kurz).toBe('Zahlend')
  })
})
