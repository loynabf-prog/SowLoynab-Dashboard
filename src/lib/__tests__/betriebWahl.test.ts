import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import { betriebFuerPosten, istPlatzhalter } from '../betriebWahl'
import { waehleSlot } from '../videoAktionen'
import { nurBetrieb } from '../../../supabase/functions/fetch-post-links/index'
import type { Channel } from '../channels'

const schlecko: Channel = { id: 'a', client_id: 'k', name: 'Schleckofatz', color: '#000', sort: 0 }
const schmacko: Channel = { id: 'b', client_id: 'k', name: 'Schmackofatz', color: '#111', sort: 1 }

describe('betriebFuerPosten', () => {
  it('nimmt den vorhandenen Betrieb, ohne zu fragen', async () => {
    const fragen = vi.fn()
    const r = await betriebFuerPosten('k', 'b', async () => ({ kanaele: [schlecko, schmacko] }), fragen)
    expect(r).toEqual({ ok: true, channelId: 'b' })
    expect(fragen).not.toHaveBeenCalled()
  })
  it('fragt nicht bei nur einem Betrieb', async () => {
    const fragen = vi.fn()
    const r = await betriebFuerPosten('k', null, async () => ({ kanaele: [schlecko] }), fragen)
    expect(r).toEqual({ ok: true, channelId: null })
    expect(fragen).not.toHaveBeenCalled()
  })
  it('fragt bei zwei Betrieben und uebernimmt die Wahl', async () => {
    const r = await betriebFuerPosten('k', null, async () => ({ kanaele: [schlecko, schmacko] }), async () => 'a')
    expect(r).toEqual({ ok: true, channelId: 'a' })
  })
  it('Abbrechen heisst: nichts tun', async () => {
    const r = await betriebFuerPosten('k', null, async () => ({ kanaele: [schlecko, schmacko] }), async () => undefined)
    expect(r).toEqual({ ok: false })
  })
})

describe('istPlatzhalter', () => {
  it('erkennt Monats- und Nummern-Platzhalter', () => {
    for (const t of ['Oktober 6', 'November 12', 'März 1', 'Kebab Kumpels #3', '', null]) expect(istPlatzhalter(t)).toBe(true)
  })
  it('laesst echte Ideen stehen', () => {
    for (const t of ['Chiapudding', 'Rückenschmerzen', 'Oktober-Special Döner']) expect(istPlatzhalter(t)).toBe(false)
  })
})

describe('waehleSlot', () => {
  const k = [
    { id: '1', title: 'Chiapudding', scheduled_date: '2026-10-02', channel_id: null },
    { id: '2', title: 'Oktober 6', scheduled_date: '2026-10-21', channel_id: 'b' },
    { id: '3', title: 'Oktober 7', scheduled_date: '2026-10-24', channel_id: null },
  ]
  it('nimmt den aeltesten Platzhalter, keine echte Idee', () => expect(waehleSlot(k, null)).toBe('2'))
  it('beachtet den gewaehlten Betrieb', () => expect(waehleSlot(k, 'a')).toBe('3'))
  it('ohne Platzhalter: null (neues Video)', () => expect(waehleSlot([k[0]], null)).toBeNull())
})

describe('nurBetrieb (Link-Abruf)', () => {
  const h = [
    { platform: 'tiktok', handle: 'schleckofatz', channel_id: 'a' },
    { platform: 'tiktok', handle: 'schmackofatz96', channel_id: 'b' },
  ]
  it('ohne Betrieb alle Accounts', () => expect(nurBetrieb(h, null)).toHaveLength(2))
  it('mit Betrieb nur dessen Account', () => expect(nurBetrieb(h, 'b').map((x) => x.handle)).toEqual(['schmackofatz96']))
  it('Betrieb ohne eigenen Account: nichts (nicht den falschen greifen)', () => expect(nurBetrieb(h, 'zzz')).toHaveLength(0))
  it('alte Daten ohne Zuordnung: alle', () => expect(nurBetrieb([{ platform: 'tiktok', handle: 'x', channel_id: null }], 'a')).toHaveLength(1))
})
