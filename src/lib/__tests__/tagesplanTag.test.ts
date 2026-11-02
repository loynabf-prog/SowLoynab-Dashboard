import { describe, it, expect } from 'vitest'
import { tagesplanTag, jetztMinuten } from '../tagesplanTag'

const H = '2026-11-02'
const t = (starts_at: string | null, ends_at: string | null = null, starts_on = H, ends_on: string | null = null) => ({ starts_on, ends_on, starts_at, ends_at })

describe('tagesplanTag', () => {
  it('vor 20 Uhr immer heute', () => {
    expect(tagesplanTag([], H, 19 * 60 + 59)).toBe(H)
  })
  it('ab 20 Uhr ohne Termin morgen', () => {
    expect(tagesplanTag([], H, 20 * 60)).toBe('2026-11-03')
  })
  it('vorbei Termine zaehlen nicht', () => {
    expect(tagesplanTag([t('14:00:00', '16:00:00'), t('19:00:00')], H, 20 * 60 + 30)).toBe('2026-11-03')
  })
  it('laufender Termin haelt heute', () => {
    expect(tagesplanTag([t('19:30:00', '21:00:00')], H, 20 * 60 + 30)).toBe(H)
  })
  it('spaeter Termin haelt heute', () => {
    expect(tagesplanTag([t('21:30:00')], H, 20 * 60 + 30)).toBe(H)
  })
  it('ganztaegige zaehlen nicht', () => {
    expect(tagesplanTag([t(null)], H, 21 * 60)).toBe('2026-11-03')
  })
  it('Termine an anderen Tagen zaehlen nicht', () => {
    expect(tagesplanTag([t('22:00:00', null, '2026-11-03')], H, 21 * 60)).toBe('2026-11-03')
  })
})

describe('jetztMinuten', () => {
  it('deutsche Zeit (Winter)', () => {
    expect(jetztMinuten(new Date('2026-11-02T19:27:00Z'))).toBe(20 * 60 + 27)
  })
})
