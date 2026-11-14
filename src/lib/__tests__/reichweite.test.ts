import { describe, it, expect } from 'vitest'
import { reichweite, agenturFaden, reichweiteSatz, zielTermine, type RVideo } from '../reichweite'

const posted = (d: string): RVideo => ({ status: 'posted', scheduled_date: d, posted_at: d + 'T18:00:00Z' })
const planned = (d: string): RVideo => ({ status: 'planned', scheduled_date: d, posted_at: null })
const arbeit: RVideo = { status: 'todo', scheduled_date: null, posted_at: null, prep_shot: true }
const idee: RVideo = { status: 'todo', scheduled_date: null, posted_at: null }

describe('reichweite', () => {
  it('verteilt 10 Videos im November alle 3 Tage', () => {
    expect(zielTermine('2026-11', 10)).toEqual([
      '2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10', '2026-11-13',
      '2026-11-16', '2026-11-19', '2026-11-22', '2026-11-25', '2026-11-28',
    ])
  })

  it('Fassies Beispiel: grün, dann gelb, dann rot', () => {
    const r = reichweite({
      monat: '2026-11', heute: '2026-11-14', ziel: 10,
      videos: [
        posted('2026-11-01'), posted('2026-11-04'), posted('2026-11-07'), posted('2026-11-10'), posted('2026-11-13'),
        planned('2026-11-16'),
        arbeit, arbeit,
        idee,
      ],
    })
    expect(r.gruenBis).toBe('2026-11-16')
    expect(r.gelbBis).toBe('2026-11-22')
    expect(r.fehlen).toBe(2)
    expect(r.tage[29]).toBe('rot')
    expect(reichweiteSatz(r)).toContain('Grün bis 16.11.')
  })

  it('verpasste Termine sind rot, auch wenn später etwas eingeplant ist', () => {
    const r = reichweite({ monat: '2026-11', heute: '2026-11-14', ziel: 10, videos: [posted('2026-11-01'), planned('2026-11-20')] })
    expect(r.termine.filter((t) => t.verpasst)).toHaveLength(4)
    expect(r.gruenBis).toBe('2026-11-16')
    expect(r.tage[2]).toBe('rot')
  })

  it('ohne Vertrag nie rot', () => {
    const r = reichweite({ monat: '2026-11', heute: '2026-11-14', ziel: 4, videos: [], mitVertrag: false })
    expect(r.tage.every((f) => f === 'gelb')).toBe(true)
  })

  it('Vorsprung zählt nach vorn', () => {
    const r = reichweite({ monat: '2026-11', heute: '2026-11-02', ziel: 4, videos: [posted('2026-11-01'), posted('2026-11-02')] })
    expect(r.gruenBis).toBe('2026-11-09')
  })

  it('Agentur = schlechtester Kunde je Tag', () => {
    const a = reichweite({ monat: '2026-11', heute: '2026-11-14', ziel: 10, videos: [planned('x'), planned('x'), planned('x'), planned('x'), planned('x'), planned('x'), ...Array(5).fill(posted('2026-11-05'))] })
    const b = reichweite({ monat: '2026-11', heute: '2026-11-14', ziel: 10, videos: [...Array(5).fill(posted('2026-11-05')), planned('2026-11-16'), arbeit] })
    const g = agenturFaden([a, b], '2026-11', '2026-11-14')
    expect(a.gruenBis).toBe('2026-11-30')
    expect(g.gruenBis).toBe(b.gruenBis)
    expect(g.gelbBis).toBe(b.gelbBis)
  })
})
