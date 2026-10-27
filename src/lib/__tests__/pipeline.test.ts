import { describe, expect, it } from 'vitest'
import { automatikSatz, bauePipeline, type PipeVideo } from '../pipeline'

const kunde = { name: 'Kebab Kumpels', client_type: 'zahlend' }
const ehrenamt = { name: 'Das Licht', client_type: 'referenz' }
const v = (id: string, stufe: string | null, status = 'todo', clients = kunde, datum: string | null = '2026-11-05'): PipeVideo =>
  ({ id, title: id, client_id: 'k', status, produktion_stufe: stufe, scheduled_date: datum, clients })

describe('bauePipeline', () => {
  it('ordnet Videos nach Stufe', () => {
    const p = bauePipeline([v('a', 'roh'), v('b', 'pruefung'), v('c', 'feinschliff'), v('d', 'fertig'), v('e', 'fertig', 'planned'), v('f', null, 'posted')], [], [])
    expect(p.automatik.map((x) => x.id)).toEqual(['a'])
    expect(p.freigabe.map((x) => x.id)).toEqual(['b'])
    expect(p.feinschliff.map((x) => x.id)).toEqual(['c'])
    expect(p.fertig.map((x) => x.id)).toEqual(['d'])
    expect(p.eingeplant.map((x) => x.id)).toEqual(['e'])
  })
  it('Aenderung in Arbeit holt das Video aus der Freigabe in die Automatik', () => {
    const p = bauePipeline([v('b', 'pruefung')], [], [{ id: '1', video_id: 'b', status: 'laeuft', wunsch: 'Musik leiser', created_at: '' }])
    expect(p.freigabe).toHaveLength(0)
    expect(p.automatik[0]).toMatchObject({ id: 'b', laeuft: true, platz: 1 })
  })
  it('Schlange: laufendes zuerst, dann zahlende vor Ehrenamt', () => {
    const p = bauePipeline([v('ehren', 'roh', 'todo', ehrenamt, '2026-11-01'), v('zahl', 'roh', 'todo', kunde, '2026-11-09')],
      [{ id: 'x', client_id: 'k', status: 'laeuft', schritt: 'Schneidet', dateien: 10, drehtag: '2026-10-27', created_at: '', clients: kunde }], [])
    expect(p.automatik.map((e) => e.platz + ':' + e.id)).toEqual(['1:x', '2:zahl', '3:ehren'])
    expect(automatikSatz(p)).toContain('1 läuft gerade, 2 warten')
  })
  it('wartender Drehtag steht im Eingang', () => {
    const p = bauePipeline([], [{ id: 'y', client_id: 'k', status: 'wartet', schritt: null, dateien: 12, drehtag: '2026-10-27', created_at: '', clients: kunde }], [])
    expect(p.eingang).toHaveLength(1)
    expect(automatikSatz(p)).toContain('Startet')
  })
})

describe('Stationen nach Zustaendigkeit (seit 27.10.2026)', () => {
  it('Vorschau landet bei dem, dem der Kunde gehoert; weitergegeben geht vor', () => {
    const personVon = (id: string | null) => (id === 'L' ? 'lion' as const : id === 'F' ? 'fassie' as const : null)
    const p = bauePipeline([
      { ...v('a', 'pruefung'), clients: { name: 'Hajo', client_type: 'zahlend', zustaendig_id: 'L' } },
      { ...v('b', 'pruefung'), clients: { name: 'Michel', client_type: 'zahlend', zustaendig_id: 'F' } },
      { ...v('c', 'pruefung'), bearbeiter_id: 'L', clients: { name: 'Michel', client_type: 'zahlend', zustaendig_id: 'F' } },
    ], [], [], personVon)
    expect(p.freigabe.map((e) => e.id)).toEqual(['b'])
    expect(p.feinschliff.map((e) => e.id).sort()).toEqual(['a', 'c'])
  })
})
