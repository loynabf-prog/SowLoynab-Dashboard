import { describe, it, expect } from 'vitest'
import { fristInfo, stand, tageZwischen, nachDringlichkeit, jetztUhrzeit } from '../fristen'
import type { Video } from '../types'

type V = Parameters<typeof fristInfo>[0]
const v = (p: Partial<Video> = {}): V => ({ status: 'todo', scheduled_date: '2026-10-30', ...p } as V)
const HEUTE = '2026-10-17'

describe('tageZwischen', () => {
  it('rechnet ganze Tage', () => {
    expect(tageZwischen('2026-10-17', '2026-10-20')).toBe(3)
    expect(tageZwischen('2026-10-20', '2026-10-17')).toBe(-3)
  })
  it('ueber die Zeitumstellung hinweg', () => {
    expect(tageZwischen('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('stand', () => {
  it('spaetere Schritte schliessen fruehere ein', () => {
    expect(stand(v({ prep_scheduled: true }))).toMatchObject({ gedreht: true, geschnitten: true, geplant: true })
  })
  it('Board-Status zaehlt mit', () => {
    expect(stand(v({ status: 'ready' }))).toMatchObject({ gedreht: true, geschnitten: true, geplant: false })
  })
})

describe('fristInfo', () => {
  it('keine Dreh-Frist mehr: ungedreht 13 Tage vorher ist gruen, Frist ist der Schnitt', () => {
    const f = fristInfo(v(), HEUTE)
    expect(f.ampel).toBe('gruen')
    expect(f.schritt).toBe('schnitt')
    expect(f.frist).toBe('2026-10-27')
  })
  it('ungedreht und Schnitt-Frist gerissen = rot, Text nennt Drehen', () => {
    const f = fristInfo(v({ scheduled_date: '2026-10-19' }), HEUTE)
    expect(f.ampel).toBe('rot')
    expect(f.text).toContain('Drehen & Schneiden')
  })
  it('ungedreht mit viel Vorlauf ist gruen', () => {
    expect(fristInfo(v({ scheduled_date: '2026-11-30' }), HEUTE).ampel).toBe('gruen')
  })
  it('ungedreht in 4 Wochen erzeugt keinen Druck', () => {
    expect(fristInfo(v({ scheduled_date: '2026-11-12' }), HEUTE).ampel).toBe('gruen')
  })
  it('gedreht, Schnitt-Frist heute = rot', () => {
    const f = fristInfo(v({ prep_shot: true, scheduled_date: '2026-10-20' }), HEUTE)
    expect(f.schritt).toBe('schnitt')
    expect(f.ampel).toBe('rot')
  })
  it('geschnitten, Planung morgen faellig = gelb', () => {
    const f = fristInfo(v({ prep_edited: true, scheduled_date: '2026-10-19' }), HEUTE)
    expect(f.schritt).toBe('planung')
    expect(f.ampel).toBe('gelb')
  })
  it('eingeplant ist gruen', () => {
    expect(fristInfo(v({ prep_scheduled: true, scheduled_date: '2026-10-18' }), HEUTE).ampel).toBe('gruen')
  })
  it('Posting-Tag vorbei und nicht gepostet = rot', () => {
    const f = fristInfo(v({ prep_scheduled: true, scheduled_date: '2026-10-15' }), HEUTE)
    expect(f.ampel).toBe('rot')
    expect(f.text).toContain('verpasst')
  })
  it('gepostet ist erledigt, ohne Datum ohne-termin', () => {
    expect(fristInfo(v({ status: 'posted' }), HEUTE).ampel).toBe('erledigt')
    expect(fristInfo(v({ scheduled_date: null }), HEUTE).ampel).toBe('ohne-termin')
  })
})

describe('Drehtag', () => {
  it('vergangener Drehtag zaehlt als gedreht', () => {
    const f = fristInfo(v({ drehtag: '2026-10-10' } as Partial<Video>), HEUTE)
    expect(f.schritt).toBe('schnitt')
  })
  it('geplanter Drehtag vor der Frist ist gruen', () => {
    const f = fristInfo(v({ scheduled_date: '2026-11-30', drehtag: '2026-11-01' } as Partial<Video>), HEUTE)
    expect(f.ampel).toBe('gruen')
  })
  it('ein Drehtag aendert an der Ampel nichts mehr', () => {
    const f = fristInfo(v({ drehtag: '2026-10-20' } as Partial<Video>), HEUTE)
    expect(f.ampel).toBe('gruen')
  })
})

describe('nachDringlichkeit', () => {
  it('rot vor gelb vor gruen', () => {
    const r = v({ scheduled_date: '2026-10-30' })
    const g = v({ scheduled_date: '2026-11-12' })
    const gr = v({ scheduled_date: '2026-12-30' })
    expect(nachDringlichkeit([gr, g, r], HEUTE)).toEqual([r, g, gr])
  })
})

describe('Post-Uhrzeit heute', () => {
  const heutePost = v({ prep_scheduled: true, scheduled_date: HEUTE, scheduled_time: '18:00:00' } as Partial<Video>)
  it('vor der Zeit: gruen', () => {
    expect(fristInfo(heutePost, HEUTE, '17:30').ampel).toBe('gruen')
  })
  it('nach der Zeit: rot', () => {
    const f = fristInfo(heutePost, HEUTE, '18:05')
    expect(f.ampel).toBe('rot')
    expect(f.text).toContain('18:00')
  })
  it('ohne Uhrzeit-Angabe wie bisher', () => {
    expect(fristInfo(heutePost, HEUTE).ampel).toBe('gruen')
  })
  it('jetztUhrzeit liefert HH:MM in deutscher Zeit', () => {
    expect(jetztUhrzeit(new Date('2026-10-18T10:07:00Z'))).toBe('12:07')
    expect(jetztUhrzeit(new Date('2026-11-18T10:07:00Z'))).toBe('11:07')
  })
})

describe('ohne Vertrag', () => {
  it('Ehrenamt/Referenz wird nie rot, sondern gelb', () => {
    const f = fristInfo({ status: 'todo', scheduled_date: '2026-10-10', clients: { client_type: 'referenz' } } as any, '2026-10-17')
    expect(f.ampel).toBe('gelb')
    expect(f.text).toContain('verpasst')
  })
  it('zahlende Kunden bleiben rot', () => {
    expect(fristInfo({ status: 'todo', scheduled_date: '2026-10-10', clients: { client_type: 'zahlend' } } as any, '2026-10-17').ampel).toBe('rot')
  })
})
