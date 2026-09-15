import { describe, expect, it } from 'vitest'
import { ARTEN, artInfo, artVon, istAktiv } from '../kundenart'

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
  it('hat drei Eintraege in der Reihenfolge der Wichtigkeit', () => {
    expect(ARTEN.map((a) => a.key)).toEqual(['zahlend', 'referenz', 'passiv'])
  })
  it('liefert zu jedem Wert etwas Anzeigbares', () => {
    expect(artInfo('referenz').titel).toBe('Ehrenamt & Referenzen')
    expect(artInfo(null).icon).toBe('💶')
  })
})
