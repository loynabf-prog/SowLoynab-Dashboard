import { describe, it, expect } from 'vitest'
import {
  monatPlus, monatName, zuordnungsMonat, monatsZeilen, monatsSumme, istAbgeschlossen, bekommtVorschlag,
  type KundeFuerMonat, type MonatsEintrag, type MonatsVideo,
} from '../monate'

const k = (id: string, p: Partial<KundeFuerMonat> = {}): KundeFuerMonat => ({
  id, name: id, logo_url: null, monthly_quota: 10, monthly_fee: '850.00', active: true, client_type: 'zahlend', ...p,
})
const e = (client_id: string, month_key: string, p: Partial<MonatsEintrag> = {}): MonatsEintrag => ({
  client_id, month_key, quota: 10, betrag: 1000, status: 'geplant', notiz: null, ...p,
})
let n = 0
const v = (client_id: string, p: Partial<MonatsVideo> = {}): MonatsVideo => ({
  id: 'v' + ++n, client_id, title: null, status: 'todo', scheduled_date: null, posted_at: null, ...p,
})

describe('Monate rechnen', () => {
  it('blaettert ueber Jahresgrenzen', () => {
    expect(monatPlus('2026-12', 1)).toBe('2027-01')
    expect(monatPlus('2026-01', -1)).toBe('2025-12')
    expect(monatName('2026-11')).toBe('November 2026')
    expect(monatName('2026-11', true)).toBe('Nov')
  })
  it('Video zaehlt zu genau einem Monat, Abrechnungsmonat gewinnt', () => {
    expect(zuordnungsMonat(v('a', { scheduled_date: '2026-10-30', abrechnungsmonat: '2026-11' }))).toBe('2026-11')
    expect(zuordnungsMonat(v('a', { scheduled_date: '2026-10-30', posted_at: '2026-11-01T10:00:00Z' }))).toBe('2026-10')
    expect(zuordnungsMonat(v('a', { posted_at: '2026-11-01T10:00:00Z' }))).toBe('2026-11')
    expect(zuordnungsMonat(v('a'))).toBeNull()
  })
  it('Vorschlag nur fuer zahlende, aktive Kunden mit Retainer', () => {
    expect(bekommtVorschlag(k('a'))).toBe(true)
    expect(bekommtVorschlag(k('a', { client_type: 'referenz' }))).toBe(false)
    expect(bekommtVorschlag(k('a', { active: false }))).toBe(false)
    expect(bekommtVorschlag(k('a', { monthly_quota: 0, monthly_fee: 0 }))).toBe(false)
  })
})

describe('monatsZeilen', () => {
  const kunden = [k('schleck'), k('kebab', { monthly_fee: 1500, monthly_quota: 6 }), k('licht', { client_type: 'referenz' })]

  it('Eintrag schlaegt Retainer, ohne Eintrag gibt es einen Vorschlag', () => {
    const z = monatsZeilen('2026-11', '2026-10', kunden, [e('schleck', '2026-11', { quota: 16, betrag: 1300, status: 'fest' })], [])
    const schleck = z.find((x) => x.kunde.id === 'schleck')!
    expect(schleck).toMatchObject({ herkunft: 'eintrag', soll: 16, betrag: 1300, status: 'fest' })
    expect(z.find((x) => x.kunde.id === 'kebab')).toMatchObject({ herkunft: 'vorschlag', soll: 6, betrag: 1500 })
    expect(z.find((x) => x.kunde.id === 'licht')).toBeUndefined()
  })
  it('vergangene und abgeschlossene Monate bekommen keine Vorschlaege', () => {
    expect(monatsZeilen('2026-09', '2026-10', kunden, [], [])).toEqual([])
    const ein = [e('schleck', '2026-10', { status: 'abgeschlossen' })]
    expect(istAbgeschlossen(ein, '2026-10')).toBe(true)
    expect(monatsZeilen('2026-10', '2026-10', kunden, ein, []).map((x) => x.kunde.id)).toEqual(['schleck'])
  })
  it('dabei=false = nicht dabei, zaehlt nicht in die Summe; 0 EUR mit dabei bleibt dabei', () => {
    const z0 = monatsZeilen('2026-11', '2026-10', kunden, [e('licht', '2026-11', { quota: 0, betrag: 0, status: 'fest' })], [])
    expect(z0.find((x) => x.kunde.id === 'licht')!.nichtDabei).toBe(false)
    const z = monatsZeilen('2026-11', '2026-10', kunden, [e('kebab', '2026-11', { quota: 0, betrag: 0, dabei: false }), e('schleck', '2026-11', { status: 'fest', betrag: 900 })], [])
    expect(z.find((x) => x.kunde.id === 'kebab')!.nichtDabei).toBe(true)
    const s = monatsSumme(z)
    expect(s.fest).toBe(900)
    expect(s.geplant).toBe(0)
    expect(s.kunden).toBe(1)
  })
  it('Videos werden dem Monat zugeordnet und gezaehlt', () => {
    const vids = [
      v('schleck', { scheduled_date: '2026-11-03' }),
      v('schleck', { scheduled_date: '2026-10-29', status: 'posted', abrechnungsmonat: '2026-11' }),
      v('schleck', { scheduled_date: '2026-10-10' }),
    ]
    const z = monatsZeilen('2026-11', '2026-10', kunden, [e('schleck', '2026-11')], vids)
    const s = z.find((x) => x.kunde.id === 'schleck')!
    expect(s.videos.length).toBe(2)
    expect(s.gepostet).toBe(1)
  })
  it('unsicher wird extra gezaehlt', () => {
    const s = monatsSumme(monatsZeilen('2026-11', '2026-10', kunden, [e('schleck', '2026-11', { betrag: 850, status: 'unsicher' }), e('kebab', '2026-11', { dabei: false, quota: 0, betrag: 0 })], []))
    expect(s.unsicher).toBe(850)
    expect(s.fest).toBe(0)
  })
  it('Summe trennt fest, geplant und Vorschlag', () => {
    const z = monatsZeilen('2026-11', '2026-10', kunden, [e('schleck', '2026-11', { betrag: 1000, status: 'geplant' })], [])
    const s = monatsSumme(z)
    expect(s.geplant).toBe(1000)
    expect(s.vorschlag).toBe(1500)
    expect(s.videosSoll).toBe(16)
  })
})
