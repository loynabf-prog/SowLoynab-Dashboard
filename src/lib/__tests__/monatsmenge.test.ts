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

describe('vorlauf (naechster Monat fertig?)', () => {
  it('zaehlt fertig/eingeplant je Kunde, zahlende zuerst', async () => {
    const { vorlauf } = await import('../monate')
    const { rangVon } = await import('../kundenart')
    const k = (id: string, art: string, quota: number) => ({ id, name: id, logo_url: null, monthly_quota: quota, monthly_fee: 0, active: true, client_type: art })
    const v = (id: string, kid: string, status: string, stufe: string | null = null) =>
      ({ id, client_id: kid, title: id, status, scheduled_date: '2026-11-10', posted_at: null, produktion_stufe: stufe })
    const r = vorlauf('2026-11', '2026-10', [k('ehren', 'referenz', 2), k('kunde', 'zahlend', 3)], [],
      [v('1', 'kunde', 'planned'), v('2', 'kunde', 'todo', 'fertig'), v('3', 'kunde', 'todo', 'roh'), v('4', 'ehren', 'todo')] as any, rangVon)
    expect(r.zeilen.map((z) => z.kunde.id)).toEqual(['kunde', 'ehren'])
    expect(r.zeilen[0]).toMatchObject({ soll: 3, fertig: 2, eingeplant: 1, mitTag: 3 })
    expect(r.soll).toBe(5)
  })
})
