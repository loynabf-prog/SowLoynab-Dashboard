import { describe, expect, it, vi } from 'vitest'
vi.mock('../supabase', () => ({ supabase: {} }))
import { baueOfen, seitText, type OfenAuftrag } from '../ofen'

const video = (id: string, art = 'zahlend') => ({ id, title: id, client_id: 'k', produktion_stufe: 'roh', status: 'todo', scheduled_date: null, clients: { name: 'K', client_type: art } })
const a = (id: string, status: OfenAuftrag['status'], reihenfolge: number, extra: Partial<OfenAuftrag> = {}): OfenAuftrag =>
  ({ id, video_id: id, art: 'erstschnitt', wunsch: 'x', status, reihenfolge, created_at: '2026-10-27T10:00:00Z', gestartet_am: null, notiz: null, videos: video(id), ...extra })

describe('baueOfen', () => {
  it('ein Video im Ofen, Rest nach Reihenfolge', () => {
    const o = baueOfen([a('c', 'offen', 30), a('b', 'offen', 10), a('ofen', 'laeuft', 5), a('kaputt', 'fehler', 1)], [])
    expect(o.imOfen?.id).toBe('ofen')
    expect(o.schlange.map((x) => x.id)).toEqual(['b', 'c'])
    expect(o.haengt.map((x) => x.id)).toEqual(['kaputt'])
  })
  it('nach vorne geschoben (kleinere Reihenfolge) steht vorne', () => {
    const o = baueOfen([a('alt', 'offen', 100), a('vorgezogen', 'offen', 99)], [])
    expect(o.schlange[0].id).toBe('vorgezogen')
  })
  it('Tablett: zahlende vor Ehrenamt', () => {
    const o = baueOfen([], [video('ehren', 'referenz'), video('kunde', 'zahlend')] as any)
    expect(o.tablett.map((v) => v.id)).toEqual(['kunde', 'ehren'])
  })
  it('Eintraege ohne Video (geloescht) fallen raus', () => {
    expect(baueOfen([a('weg', 'offen', 1, { videos: null })], []).schlange).toHaveLength(0)
  })
})

describe('seitText', () => {
  it('Minuten und Stunden', () => {
    const jetzt = Date.parse('2026-10-27T12:00:00Z')
    expect(seitText('2026-10-27T11:48:00Z', jetzt)).toBe('12 Min.')
    expect(seitText('2026-10-27T10:30:00Z', jetzt)).toBe('1 Std. 30 Min.')
  })
})
