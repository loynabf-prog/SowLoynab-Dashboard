import { describe, it, expect } from 'vitest'
import {
  normHandle, profilUrl, accountName, planeAbgleich,
  nurGesamt, nurAccounts, letzterStandJeAccount,
  type ClientAccount, type AccountEntwurf,
} from '../accounts'

describe('normHandle', () => {
  it('nimmt das @ weg', () => {
    expect(normHandle('@Schleckofatz')).toBe('schleckofatz')
  })
  it('vertraegt Leerzeichen und Grossschreibung', () => {
    expect(normHandle('  SchmackoFatz  ')).toBe('schmackofatz')
  })
  it('zieht das Handle aus einer Instagram-URL', () => {
    expect(normHandle('https://www.instagram.com/schleckofatz/')).toBe('schleckofatz')
  })
  it('zieht das Handle aus einer TikTok-URL', () => {
    expect(normHandle('https://www.tiktok.com/@schmackofatz?lang=de')).toBe('schmackofatz')
  })
  it('macht aus leer auch leer', () => {
    expect(normHandle(null)).toBe('')
    expect(normHandle('   ')).toBe('')
  })
})

describe('profilUrl', () => {
  it('baut den Instagram-Link', () => {
    expect(profilUrl('instagram', '@Test')).toBe('https://instagram.com/test')
  })
  it('baut den TikTok-Link mit @', () => {
    expect(profilUrl('tiktok', 'Test')).toBe('https://www.tiktok.com/@test')
  })
})

describe('accountName', () => {
  it('nimmt den Klarnamen, wenn es einen gibt', () => {
    expect(accountName({ label: 'Schleckofatz', handle: 'schleck' })).toBe('Schleckofatz')
  })
  it('faellt sonst auf das Handle zurueck', () => {
    expect(accountName({ label: '  ', handle: 'schleck' })).toBe('@schleck')
  })
})

const vorhanden = (id: string, platform: 'instagram' | 'tiktok', handle: string): ClientAccount =>
  ({ id, client_id: 'k1', platform, handle, label: null, sort: 0 })

const entwurf = (id: string | null, platform: 'instagram' | 'tiktok', handle: string, label = ''): AccountEntwurf =>
  ({ id, platform, handle, label })

describe('planeAbgleich', () => {
  it('legt einen neuen Account an', () => {
    const p = planeAbgleich([], [entwurf(null, 'instagram', '@neu')])
    expect(p.anlegen).toHaveLength(1)
    expect(p.anlegen[0].handle).toBe('neu')
    expect(p.aendern).toHaveLength(0)
    expect(p.loeschen).toHaveLength(0)
  })

  it('loescht einen entfernten Account', () => {
    const p = planeAbgleich([vorhanden('a1', 'instagram', 'alt')], [])
    expect(p.loeschen).toEqual(['a1'])
    expect(p.anlegen).toHaveLength(0)
  })

  it('aendert ein bearbeitetes Handle', () => {
    const p = planeAbgleich([vorhanden('a1', 'instagram', 'alt')], [entwurf('a1', 'instagram', 'neu')])
    expect(p.aendern).toEqual([{ id: 'a1', platform: 'instagram', handle: 'neu', label: null, sort: 0 }])
    expect(p.loeschen).toHaveLength(0)
  })

  it('ignoriert leere Zeilen', () => {
    const p = planeAbgleich([], [entwurf(null, 'instagram', '   '), entwurf(null, 'tiktok', 'da')])
    expect(p.anlegen).toHaveLength(1)
    expect(p.anlegen[0].platform).toBe('tiktok')
  })

  it('wirft Dubletten innerhalb des Formulars raus', () => {
    const p = planeAbgleich([], [entwurf(null, 'instagram', 'gleich'), entwurf(null, 'instagram', '@GLEICH')])
    expect(p.anlegen).toHaveLength(1)
  })

  it('laesst dasselbe Handle auf zwei Plattformen zu', () => {
    const p = planeAbgleich([], [entwurf(null, 'instagram', 'x'), entwurf(null, 'tiktok', 'x')])
    expect(p.anlegen).toHaveLength(2)
  })

  it('nummeriert die Reihenfolge durch -- der erste ist der Hauptaccount', () => {
    const p = planeAbgleich([], [entwurf(null, 'instagram', 'eins'), entwurf(null, 'instagram', 'zwei')])
    expect(p.anlegen.map((a) => a.sort)).toEqual([0, 1])
  })

  it('zwei Instagram und zwei TikTok gehen zusammen', () => {
    const p = planeAbgleich([], [
      entwurf(null, 'instagram', 'schleckofatz', 'Schleckofatz'),
      entwurf(null, 'instagram', 'schmackofatz', 'Schmackofatz'),
      entwurf(null, 'tiktok', 'schleckofatz', 'Schleckofatz'),
      entwurf(null, 'tiktok', 'schmackofatz', 'Schmackofatz'),
    ])
    expect(p.anlegen).toHaveLength(4)
    expect(p.anlegen.filter((a) => a.platform === 'instagram')).toHaveLength(2)
    expect(p.anlegen.filter((a) => a.platform === 'tiktok')).toHaveLength(2)
  })
})

describe('Zeilen trennen', () => {
  const zeilen = [
    { account_id: null, followers_ig: 100 },
    { account_id: 'a1', followers_ig: 60 },
    { account_id: 'a2', followers_ig: 40 },
  ]
  it('nurGesamt nimmt nur die Gesamtzeile', () => {
    expect(nurGesamt(zeilen)).toHaveLength(1)
  })
  it('nurAccounts nimmt nur die Account-Zeilen', () => {
    expect(nurAccounts(zeilen)).toHaveLength(2)
  })
  it('ohne Migration bleibt alles Gesamtzeile', () => {
    const alt = [{ followers_ig: 10 }, { followers_ig: 20 }] as { account_id?: string | null; followers_ig: number }[]
    expect(nurGesamt(alt)).toHaveLength(2)
    expect(nurAccounts(alt)).toHaveLength(0)
  })
})

describe('letzterStandJeAccount', () => {
  it('nimmt je Account den letzten Wert', () => {
    const m = letzterStandJeAccount([
      { account_id: 'a1', followers_ig: 100, followers_tiktok: null },
      { account_id: 'a2', followers_ig: null, followers_tiktok: 50 },
      { account_id: 'a1', followers_ig: 120, followers_tiktok: null },
    ])
    expect(m.get('a1')).toBe(120)
    expect(m.get('a2')).toBe(50)
  })
  it('ueberspringt Gesamtzeilen', () => {
    const m = letzterStandJeAccount([{ account_id: null, followers_ig: 999 }])
    expect(m.size).toBe(0)
  })
})
