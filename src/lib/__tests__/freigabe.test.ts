import { describe, it, expect } from 'vitest'
import { feinschliffPfad, offeneRunde, platzInSchlange, vorschauPfad, type Aenderung } from '../freigabe'

const a = (id: string, video_id: string, status: Aenderung['status'], created_at: string): Aenderung =>
  ({ id, video_id, status, created_at, wunsch: 'x', notiz: null, erledigt_am: null })

describe('freigabe', () => {
  it('Zielordner in 3 Feinschliff behaelt den Namen', () => {
    expect(feinschliffPfad('/Sow & Loynab Media/2 Im Schnitt/U-Act Michel - Nacken/'))
      .toBe('/Sow & Loynab Media/3 Feinschliff/U-Act Michel - Nacken')
  })
  it('Vorschau liegt im Video-Ordner', () => {
    expect(vorschauPfad('/Sow & Loynab Media/2 Im Schnitt/X - Y')).toBe('/Sow & Loynab Media/2 Im Schnitt/X - Y/Vorschau.mp4')
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
