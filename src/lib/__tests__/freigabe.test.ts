import { describe, it, expect } from 'vitest'
import { archivZiel, besteDatei, offeneRunde, platzInSchlange, vorschauPfad, type Aenderung } from '../freigabe'

const a = (id: string, video_id: string, status: Aenderung['status'], created_at: string): Aenderung =>
  ({ id, video_id, status, created_at, wunsch: 'x', notiz: null, erledigt_am: null })

describe('freigabe', () => {
  it('Archiv: Kunde/Datum Idee', () => {
    expect(archivZiel('/Sow & Loynab Media/2 In Arbeit/U-Act Michel - Nacken/', 'Michel Uact', '2026-10-30'))
      .toBe('/Sow & Loynab Archiv/U-Act Michel/2026-10-30 Nacken')
    expect(archivZiel('/Sow & Loynab Media/2 In Arbeit/Waffeln', 'Schleckofatz', '2026-10-30')).toBe('/Sow & Loynab Archiv/Schleckofatz/2026-10-30 Waffeln')
  })
  it('beste Datei: volle Qualitaet vor Export vor Vorschau', () => {
    const e = (name: string, geaendert = '2026-10-28') => ({ name, pfad: '/x/' + name, art: 'video' as const, geaendert, groesse: 1 })
    expect(besteDatei([e('Vorschau.mp4'), e('Export_v2.mp4'), e('Export_v3_volle_Qualitaet.mp4')])).toBe('/x/Export_v3_volle_Qualitaet.mp4')
    expect(besteDatei([e('Vorschau.mp4'), e('Export_v1.mp4', '2026-10-01'), e('Export_v2.mp4', '2026-10-02')])).toBe('/x/Export_v2.mp4')
    expect(besteDatei([e('Vorschau.mp4')])).toBe('/x/Vorschau.mp4')
    expect(besteDatei([])).toBeNull()
  })
  it('Vorschau liegt im Video-Ordner', () => {
    expect(vorschauPfad('/Sow & Loynab Media/2 In Arbeit/X - Y')).toBe('/Sow & Loynab Media/2 In Arbeit/X - Y/Vorschau.mp4')
  })
  it('Warteschlange: aeltester offener Wunsch zuerst, laufender zaehlt mit', () => {
    const liste = [
      a('3', 'v3', 'offen', '2026-10-22T13:03:00Z'),
      a('1', 'v1', 'laeuft', '2026-10-22T13:00:00Z'),
      a('2', 'v2', 'offen', '2026-10-22T13:01:00Z'),
      a('0', 'v0', 'erledigt', '2026-10-22T12:00:00Z'),
    ]
    expect(platzInSchlange(liste, '2')).toBe(2)
    expect(platzInSchlange(liste, '3')).toBe(3)
    expect(platzInSchlange(liste, '1')).toBeNull()
    expect(platzInSchlange(liste, '0')).toBeNull()
  })
  it('offene Runde eines Videos', () => {
    const liste = [a('1', 'v1', 'erledigt', '2026-10-22T12:00:00Z'), a('2', 'v1', 'offen', '2026-10-22T13:00:00Z')]
    expect(offeneRunde(liste, 'v1')?.id).toBe('2')
    expect(offeneRunde(liste, 'v2')).toBeNull()
  })
})
