import { describe, it, expect } from 'vitest'
import {
  FARBEN, naechsteFarbe, planeKanalAbgleich, trenntKanaele, kanalVon,
  nachKanal, zaehleJeKanal, zuKanalEntwuerfen,
  type Channel, type ChannelEntwurf,
} from '../channels'

const kanal = (id: string, name: string, color: string = FARBEN[0], sort = 0): Channel =>
  ({ id, client_id: 'k1', name, color, sort })
const entwurf = (id: string | null, name: string, color: string = FARBEN[0]): ChannelEntwurf =>
  ({ id, name, color })

describe('naechsteFarbe', () => {
  it('nimmt die erste freie Farbe', () => {
    expect(naechsteFarbe([])).toBe(FARBEN[0])
    expect(naechsteFarbe([FARBEN[0]])).toBe(FARBEN[1])
  })
  it('zwei Kanäle bekommen nie dieselbe Farbe', () => {
    const a = naechsteFarbe([])
    const b = naechsteFarbe([a])
    expect(a).not.toBe(b)
  })
  it('faengt von vorne an, wenn alle belegt sind', () => {
    expect(FARBEN).toContain(naechsteFarbe([...FARBEN]))
  })
})

describe('planeKanalAbgleich', () => {
  it('legt einen neuen Kanal an', () => {
    const p = planeKanalAbgleich([], [entwurf(null, 'Schleckofatz')])
    expect(p.anlegen).toHaveLength(1)
    expect(p.anlegen[0].name).toBe('Schleckofatz')
  })
  it('loescht einen entfernten Kanal', () => {
    const p = planeKanalAbgleich([kanal('a', 'Alt')], [])
    expect(p.loeschen).toEqual(['a'])
  })
  it('aendert Namen und Farbe', () => {
    const p = planeKanalAbgleich([kanal('a', 'Alt')], [entwurf('a', 'Neu', FARBEN[2])])
    expect(p.aendern).toEqual([{ id: 'a', name: 'Neu', color: FARBEN[2], sort: 0 }])
  })
  it('ignoriert leere Namen', () => {
    const p = planeKanalAbgleich([], [entwurf(null, '   '), entwurf(null, 'Da')])
    expect(p.anlegen).toHaveLength(1)
  })
  it('wirft gleiche Namen raus -- auch bei anderer Schreibweise', () => {
    const p = planeKanalAbgleich([], [entwurf(null, 'Schleck'), entwurf(null, 'SCHLECK')])
    expect(p.anlegen).toHaveLength(1)
  })
  it('nummeriert die Reihenfolge durch', () => {
    const p = planeKanalAbgleich([], [entwurf(null, 'Eins'), entwurf(null, 'Zwei')])
    expect(p.anlegen.map((k) => k.sort)).toEqual([0, 1])
  })
})

describe('trenntKanaele', () => {
  it('bei keinem oder einem Kanal wird nicht getrennt', () => {
    expect(trenntKanaele([])).toBe(false)
    expect(trenntKanaele([kanal('a', 'Nur einer')])).toBe(false)
  })
  it('ab zwei Kanälen schon', () => {
    expect(trenntKanaele([kanal('a', 'A'), kanal('b', 'B')])).toBe(true)
  })
})

describe('kanalVon', () => {
  const liste = [kanal('a', 'A'), kanal('b', 'B')]
  it('findet den Kanal', () => {
    expect(kanalVon(liste, 'b')?.name).toBe('B')
  })
  it('vertraegt leer und unbekannt', () => {
    expect(kanalVon(liste, null)).toBeNull()
    expect(kanalVon(liste, 'weg')).toBeNull()
  })
})

describe('nachKanal', () => {
  const videos = [
    { id: 1, channel_id: 'a' },
    { id: 2, channel_id: 'b' },
    { id: 3, channel_id: null },
  ]
  it('ohne Filter kommt alles durch', () => {
    expect(nachKanal(videos, null)).toHaveLength(3)
  })
  it('filtert auf einen Kanal', () => {
    expect(nachKanal(videos, 'a').map((v) => v.id)).toEqual([1])
  })
  it('"offen" zeigt die ohne Zuordnung', () => {
    expect(nachKanal(videos, 'offen').map((v) => v.id)).toEqual([3])
  })
  it('ohne Migration hat nichts eine Zuordnung -- Filter liefert dann nichts', () => {
    const alt = [{ id: 1 }, { id: 2 }] as { id: number; channel_id?: string | null }[]
    expect(nachKanal(alt, null)).toHaveLength(2)
    expect(nachKanal(alt, 'offen')).toHaveLength(2)
  })
})

describe('zaehleJeKanal', () => {
  it('zaehlt je Kanal und die ohne Zuordnung', () => {
    const { jeKanal, offen } = zaehleJeKanal([
      { channel_id: 'a' }, { channel_id: 'a' }, { channel_id: 'b' }, { channel_id: null },
    ])
    expect(jeKanal.get('a')).toBe(2)
    expect(jeKanal.get('b')).toBe(1)
    expect(offen).toBe(1)
  })
})

describe('zuKanalEntwuerfen', () => {
  it('uebernimmt Id, Name und Farbe', () => {
    expect(zuKanalEntwuerfen([kanal('a', 'A', FARBEN[3])])).toEqual([
      { id: 'a', name: 'A', color: FARBEN[3] },
    ])
  })
})
