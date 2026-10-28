import { describe, it, expect } from 'vitest'
import { baueBackstube, stufeVon, type BAuftrag, type BVideo } from '../backstube'

const F = 'fassie', L = 'lion'
const kunde = (id: string, zust: string, quota = 10) => ({ id, name: id, zustaendig_id: zust, monthly_quota: quota, active: true })

function video(id: string, o: Partial<BVideo> = {}, k = kunde('hajo', L)): BVideo {
  return { id, title: id, client_id: k.id, status: 'todo', scheduled_date: '2026-10-20', clients: k, ...o }
}
function auftrag(id: string, video_id: string, o: Partial<BAuftrag> = {}): BAuftrag {
  return { id, video_id, art: 'erstschnitt', wunsch: 'x', status: 'offen', reihenfolge: 1, created_at: '2026-10-28T06:00:00Z', gestartet_am: null, notiz: null, ...o }
}

describe('stufeVon', () => {
  it('ordnet jede Pizza richtig ein', () => {
    expect(stufeVon(video('a'), null)).toBe('teig')
    expect(stufeVon(video('a', { prep_shot: true }), null)).toBe('belegt')
    expect(stufeVon(video('a', { produktion_stufe: 'pruefung' }), null)).toBe('raus')
    expect(stufeVon(video('a', { produktion_stufe: 'fertig' }), null)).toBe('teller')
    expect(stufeVon(video('a', { status: 'posted' }), null)).toBe('gegessen')
    expect(stufeVon(video('a', { produktion_stufe: 'pruefung' }), auftrag('1', 'a'))).toBe('zettel')
    expect(stufeVon(video('a'), auftrag('1', 'a', { status: 'laeuft' }))).toBe('ofen')
  })
})

describe('baueBackstube', () => {
  it('jeder Ofen backt nur seine Kunden, Schlange nach Reihenfolge', () => {
    const michel = kunde('michel', F)
    const b = baueBackstube({
      videos: [video('h1'), video('h2'), video('h3'), video('m1', {}, michel)],
      auftraege: [
        auftrag('a1', 'h1', { status: 'laeuft', gestartet_am: '2026-10-28T06:10:00Z', fortschritt: 40 }),
        auftrag('a2', 'h2', { reihenfolge: 5 }),
        auftrag('a3', 'h3', { reihenfolge: 2 }),
        auftrag('a4', 'm1', { reihenfolge: 1 }),
      ],
      team: [F, L], monat: '2026-10',
    })
    const lion = b.oefen.get(L)!, fassie = b.oefen.get(F)!
    expect(lion.imOfen?.video.id).toBe('h1')
    expect(lion.schlange.map((p) => p.video.id)).toEqual(['h3', 'h2'])
    expect(fassie.imOfen).toBeNull()
    expect(fassie.schlange.map((p) => p.video.id)).toEqual(['m1'])
  })

  it('weitergegebene Videos landen im Ofen des anderen', () => {
    const b = baueBackstube({ videos: [video('h1', { bearbeiter_id: F, produktion_stufe: 'pruefung' })], auftraege: [], team: [F, L], monat: '2026-10' })
    expect(b.oefen.get(F)!.raus).toHaveLength(1)
    expect(b.oefen.get(L)!.raus).toHaveLength(0)
  })

  it('Bestellungen zaehlen den Monat nach Stufe', () => {
    const b = baueBackstube({
      videos: [video('h1', { status: 'posted' }), video('h2', { produktion_stufe: 'fertig' }), video('h3'), video('alt', { scheduled_date: '2026-09-01', status: 'posted' })],
      auftraege: [], team: [F, L], monat: '2026-10', plaene: new Map([['hajo', 15]]),
    })
    const h = b.bestellungen.find((x) => x.kunde.id === 'hajo')!
    expect(h.soll).toBe(15)
    expect(h.zaehlung.gegessen).toBe(1)
    expect(h.zaehlung.teller).toBe(1)
    expect(h.zaehlung.teig).toBe(1)
  })

  it('pausierte Kunden fliegen raus', () => {
    const pause = { ...kunde('kebab', L), active: false }
    const b = baueBackstube({ videos: [video('k1', {}, pause)], auftraege: [], team: [F, L], monat: '2026-10' })
    expect(b.pizzen).toHaveLength(0)
  })
})
