import { describe, it, expect } from 'vitest'
import { kundenLage, pilot, meine, pushZeilen, tageImMonat, type PilotKunde } from '../pilot'

const F = 'fassie', L = 'lion'

function kunde(x: Partial<PilotKunde> & { name: string }): PilotKunde {
  return {
    client_id: x.name.toLowerCase(), logo_url: null, client_type: 'zahlend', zustaendig_id: F,
    pausiert_seit: null, contract_end: null, heute: '2026-10-28', monat: '2026-10',
    ziel: 10, ziel_naechster: 10, gepostet: 0, offen_monat: 0, gepostet_7t: 0,
    eingeplant: 0, fertig_ohne_termin: 0, im_ofen: 0, zettel: 0, raus: 0, belegt: 0, teig: 0, ideen: 0,
    links_fehlen: 0, zahlen_alt: 0, zuletzt_gepostet: null, naechster_drehtag: null, drehtag_videos: 0,
    vormonat_status: null, vormonat_zahlstatus: null, vormonat_quota: null,
    ...x,
  }
}

describe('kundenLage', () => {
  it('rechnet Soll nach Monatsanteil', () => {
    expect(tageImMonat('2026-10')).toBe(31)
    const l = kundenLage(kunde({ name: 'Hajo', ziel: 15, gepostet: 0 }))
    expect(l.soll).toBe(14) // 28/31 * 15
    expect(l.ampel).toBe('rot')
    expect(l.satz).toContain('nach Plan wären es 14')
  })
  it('Vorrat zaehlt alles mit Material, Bedarf schaut 30 Tage voraus', () => {
    const l = kundenLage(kunde({ name: 'K', ziel: 10, gepostet: 9, eingeplant: 1, belegt: 2, ziel_naechster: 10 }))
    // Rest 1 + naechster Monat anteilig (30-3)/30*10 = 9 -> Bedarf 10, Vorrat 3
    expect(l.rest).toBe(1)
    expect(l.bedarf).toBe(10)
    expect(l.vorrat).toBe(3)
    expect(l.fehlt).toBe(7)
  })
  it('gruen, wenn Ziel erreicht', () => {
    const l = kundenLage(kunde({ name: 'K', ziel: 6, gepostet: 6, ziel_naechster: 0 }))
    expect(l.ampel).toBe('gruen')
    expect(l.satz).toBe('Ziel erreicht: 6 von 6')
  })
  it('Ehrenamt wird nie rot', () => {
    const l = kundenLage(kunde({ name: 'Licht', client_type: 'referenz', ziel: 10, gepostet: 1 }))
    expect(l.ampel).toBe('gelb')
  })
})

describe('pilot', () => {
  it('Raus kommt vor Rueckstand vor Drehtag', () => {
    const p = pilot({ kunden: [kunde({ name: 'Hajo', ziel: 15, raus: 2 })] })
    // Der Rueckstand sagt schon "Drehtag planen" -- die Drehtag-Zeile geht darin auf
    expect(p.empfehlungen.map((x) => x.art)).toEqual(['raus', 'rueckstand', 'ideen'])
    expect(p.empfehlungen[0].titel).toBe('2 Videos warten auf dein OK')
    expect(p.empfehlungen[0].warum).toContain('Hajo')
    expect(p.empfehlungen[1].zahl).toBe(22)
    expect(p.empfehlungen[1].warum).toContain('Kein Drehtag geplant')
  })
  it('die eine Aktion sitzt dort, wo es klemmt', () => {
    const a = pilot({ kunden: [kunde({ name: 'A', ziel: 15, fertig_ohne_termin: 2 })] }).empfehlungen.find((x) => x.art === 'rueckstand')!
    expect(a.aktion).toBe('Einplanen')
    const b = pilot({ kunden: [kunde({ name: 'B', ziel: 15, belegt: 3 })] }).empfehlungen.find((x) => x.art === 'rueckstand')!
    expect(b.aktion).toBe('In den Ofen')
    const c = pilot({ kunden: [kunde({ name: 'C', ziel: 15 })] }).empfehlungen.find((x) => x.art === 'rueckstand')!
    expect(c.aktion).toBe('Drehtag planen')
  })
  it('Drehtag vorhanden, aber zu klein', () => {
    const p = pilot({ kunden: [kunde({ name: 'K', ziel: 0, ziel_naechster: 10, naechster_drehtag: '2026-11-05', drehtag_videos: 4, ideen: 20 })] })
    const d = p.empfehlungen.find((x) => x.art === 'drehtag_klein')!
    expect(d).toBeTruthy()
    expect(d.titel).toBe('Drehtag am 5.11. zu klein')
    expect(p.empfehlungen.some((x) => x.art === 'ideen')).toBe(false)
  })
  it('Ofen leer je Besitzer', () => {
    const p = pilot({ kunden: [
      kunde({ name: 'A', zustaendig_id: F, belegt: 2, ziel: 0, ziel_naechster: 0 }),
      kunde({ name: 'B', zustaendig_id: L, belegt: 1, im_ofen: 1, ziel: 0, ziel_naechster: 0 }),
    ] })
    const o = p.empfehlungen.filter((x) => x.art === 'ofen')
    expect(o).toHaveLength(1)
    expect(o[0].besitzer).toBe(F)
    expect(meine(p.empfehlungen, L).some((x) => x.art === 'ofen')).toBe(false)
  })
  it('pausiert: nur Nachfassen, keine Rueckstands-Panik', () => {
    const p = pilot({ kunden: [kunde({ name: 'Kebab', pausiert_seit: '2026-10-01', ziel: 6 })] })
    expect(p.empfehlungen.map((x) => x.art)).toEqual(['pause'])
    expect(p.empfehlungen[0].titel).toBe('Pausiert seit 27 Tagen')
  })
  it('Vormonat ohne Rechnung', () => {
    const p = pilot({ kunden: [kunde({ name: 'K', ziel: 0, ziel_naechster: 0, vormonat_quota: 10, vormonat_status: 'fest', vormonat_zahlstatus: 'offen' })] })
    expect(p.empfehlungen[0].art).toBe('abrechnung')
    expect(p.empfehlungen[0].titel).toBe('September: Rechnung noch nicht raus')
  })
  it('Erfolg wird zur Idee', () => {
    const p = pilot({ kunden: [kunde({ name: 'K', ziel: 0, ziel_naechster: 0 })], erfolge: [{ client_id: 'k', video_id: 'v1', title: 'Waffeln', faktor: 2.4 }, { client_id: 'k', video_id: 'v2', title: 'Lahm', faktor: 1.1 }] })
    expect(p.empfehlungen).toHaveLength(1)
    expect(p.empfehlungen[0].titel).toBe('„Waffeln“ läuft 2,4× besser als sonst')
  })
  it('Vertrag endet bald', () => {
    const p = pilot({ kunden: [kunde({ name: 'K', ziel: 0, ziel_naechster: 0, contract_end: '2026-11-10' })] })
    expect(p.empfehlungen[0].titel).toBe('Vertrag endet in 13 Tagen')
  })
  it('Push-Zeilen tragen den Kunden voran', () => {
    const p = pilot({ kunden: [kunde({ name: 'Hajo', ziel: 15, raus: 1 })] })
    expect(pushZeilen(p.empfehlungen, 2)).toEqual(['1 Video wartet auf dein OK', 'Hajo: 0 von 15 gepostet — nach Plan 14'])
  })
})
