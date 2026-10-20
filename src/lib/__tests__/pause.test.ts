import { describe, it, expect } from 'vitest'
import { istPausiert, ohnePausierte, nachPause, pauseText } from '../pause'

describe('Pause', () => {
  const rows = [
    { id: 1, clients: { pausiert_seit: '2026-10-20' } },
    { id: 2, clients: { pausiert_seit: null } },
    { id: 3, clients: null },
  ]
  it('erkennt pausierte Kunden', () => {
    expect(istPausiert({ pausiert_seit: '2026-10-20' })).toBe(true)
    expect(istPausiert({ pausiert_seit: null })).toBe(false)
    expect(istPausiert(null)).toBe(false)
  })
  it('filtert und teilt auf, Zeilen ohne Kunde bleiben', () => {
    expect(ohnePausierte(rows).map((r) => r.id)).toEqual([2, 3])
    const t = nachPause(rows)
    expect(t.pausiert.map((r) => r.id)).toEqual([1])
    expect(t.laufend.map((r) => r.id)).toEqual([2, 3])
  })
  it('Text', () => {
    expect(pauseText({ pausiert_seit: '2026-10-20', pause_grund: 'Warten auf den Chef' })).toBe('Pausiert seit 20.10. · Warten auf den Chef')
  })
})
