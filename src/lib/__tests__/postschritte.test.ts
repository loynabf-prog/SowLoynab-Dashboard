import { describe, it, expect } from 'vitest'
import {
  postPhase, beideLinksDa, fehlendeLinks, vorarbeit, vorarbeitFertig,
  vorarbeitStand, naechsterSchritt, offeneHeute,
} from '../postschritte'
import type { Video } from '../types'

type Teil = Parameters<typeof naechsterSchritt>[0]
const v = (p: Partial<Video> = {}): Teil => ({
  status: 'todo', tiktok_url: null, instagram_url: null, ...p,
} as Teil)

describe('postPhase', () => {
  it('noch nicht gepostet ist offen', () => {
    expect(postPhase(v())).toBe('offen')
  })
  it('gepostet ohne Links ist noch nicht durch', () => {
    expect(postPhase(v({ status: 'posted' }))).toBe('gepostet')
  })
  it('ein Link allein reicht nicht', () => {
    expect(postPhase(v({ status: 'posted', tiktok_url: 'https://t' }))).toBe('gepostet')
  })
  it('erst mit beiden Links ist es fertig', () => {
    expect(postPhase(v({ status: 'posted', tiktok_url: 'https://t', instagram_url: 'https://i' }))).toBe('fertig')
  })
  it('leere Zeichenkette zaehlt nicht als Link', () => {
    expect(postPhase(v({ status: 'posted', tiktok_url: '   ', instagram_url: 'https://i' }))).toBe('gepostet')
  })
})

describe('beideLinksDa / fehlendeLinks', () => {
  it('nennt den fehlenden Link', () => {
    expect(fehlendeLinks(v({ instagram_url: 'https://i' }))).toEqual(['tiktok'])
    expect(fehlendeLinks(v({ tiktok_url: 'https://t' }))).toEqual(['instagram'])
  })
  it('nennt beide, wenn beide fehlen', () => {
    expect(fehlendeLinks(v())).toEqual(['tiktok', 'instagram'])
  })
  it('nennt nichts, wenn beide da sind', () => {
    const x = v({ tiktok_url: 'https://t', instagram_url: 'https://i' })
    expect(fehlendeLinks(x)).toEqual([])
    expect(beideLinksDa(x)).toBe(true)
  })
})

describe('Vorarbeit', () => {
  it('liefert drei Schritte in Arbeitsreihenfolge', () => {
    expect(vorarbeit({}).map((s) => s.label)).toEqual(['Gedreht', 'Geschnitten', 'Eingeplant'])
  })
  it('zaehlt die erledigten', () => {
    expect(vorarbeitStand({})).toBe(0)
    expect(vorarbeitStand({ prep_shot: true })).toBe(1)
    expect(vorarbeitStand({ prep_shot: true, prep_edited: true, prep_scheduled: true })).toBe(3)
  })
  it('ist erst mit allen dreien fertig', () => {
    expect(vorarbeitFertig({ prep_shot: true, prep_edited: true })).toBe(false)
    expect(vorarbeitFertig({ prep_shot: true, prep_edited: true, prep_scheduled: true })).toBe(true)
  })
  it('spaeterer Schritt schliesst die frueheren ein', () => {
    // Was geschnitten ist, ist gedreht -- gleiche Regel wie die Fristen-Ampel.
    expect(vorarbeitStand({ prep_edited: true })).toBe(2)
  })
  it('Board-Status zaehlt mit', () => {
    expect(vorarbeitStand({ status: 'ready' })).toBe(2)
    expect(vorarbeitFertig({ status: 'planned' })).toBe(true)
  })
  it('ohne Migration gilt alles als offen', () => {
    expect(vorarbeitStand({})).toBe(0)
    expect(vorarbeitFertig({})).toBe(false)
  })
})

describe('naechsterSchritt', () => {
  it('nennt den ersten offenen Vorarbeits-Schritt', () => {
    expect(naechsterSchritt(v())).toBe('Noch gedreht')
    expect(naechsterSchritt(v({ prep_shot: true }))).toBe('Noch geschnitten')
  })
  it('nach der Vorarbeit heisst es posten', () => {
    expect(naechsterSchritt(v({ prep_shot: true, prep_edited: true, prep_scheduled: true }))).toBe('Posten')
  })
  it('nach dem Posten zaehlen die Links', () => {
    expect(naechsterSchritt(v({ status: 'posted' }))).toBe('Beide Links eintragen')
    expect(naechsterSchritt(v({ status: 'posted', tiktok_url: 'https://t' }))).toBe('Instagram-Link eintragen')
    expect(naechsterSchritt(v({ status: 'posted', instagram_url: 'https://i' }))).toBe('TikTok-Link eintragen')
  })
  it('mit beiden Links ist Schluss', () => {
    expect(naechsterSchritt(v({ status: 'posted', tiktok_url: 'https://t', instagram_url: 'https://i' }))).toBe('Erledigt')
  })
})

describe('offeneHeute', () => {
  it('zaehlt alles, was noch nicht ganz durch ist', () => {
    expect(offeneHeute([
      v(),
      v({ status: 'posted' }),
      v({ status: 'posted', tiktok_url: 'https://t', instagram_url: 'https://i' }),
    ])).toBe(2)
  })
  it('eine leere Liste hat nichts offen', () => {
    expect(offeneHeute([])).toBe(0)
  })
})

import { plattformenVon, mitPlattformen } from '../postschritte'

describe('Kunden mit nur einer Plattform', () => {
  it('plattformenVon liest Accounts, sonst alte Handles, sonst beide', () => {
    expect(plattformenVon({ client_accounts: [{ platform: 'tiktok' }] })).toEqual(['tiktok'])
    expect(plattformenVon({ handle_ig: 'kraftfeld', handle_tiktok: '' })).toEqual(['instagram'])
    expect(plattformenVon({ client_accounts: [] })).toEqual(['tiktok', 'instagram'])
    expect(plattformenVon(null)).toEqual(['tiktok', 'instagram'])
  })
  it('nur-TikTok-Kunde ist mit TikTok-Link fertig', () => {
    const x = { status: 'posted' as const, tiktok_url: 'https://t', instagram_url: null, plattformen: ['tiktok' as const] }
    expect(postPhase(x)).toBe('fertig')
    expect(naechsterSchritt(x)).toBe('Erledigt')
  })
  it('nur-Instagram-Kunde fehlt nur der Instagram-Link', () => {
    expect(fehlendeLinks({ tiktok_url: null, instagram_url: null, plattformen: ['instagram'] })).toEqual(['instagram'])
  })
  it('mitPlattformen haengt die Plattformen an', () => {
    const [r] = mitPlattformen([{ id: 1, clients: { handle_tiktok: 'b' } }])
    expect(r.plattformen).toEqual(['tiktok'])
  })
})
