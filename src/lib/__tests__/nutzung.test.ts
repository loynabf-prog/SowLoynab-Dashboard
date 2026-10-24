import { describe, it, expect } from 'vitest'
import { aufrufVon, normPfad } from '../nutzung'

describe('nutzung', () => {
  it('fasst Kunden- und Chatseiten zusammen', () => {
    expect(normPfad('/client/abc-123')).toBe('/client')
    expect(normPfad('/chat/x')).toBe('/chat')
    expect(normPfad('/plan')).toBe('/plan')
    expect(normPfad('/')).toBe('/')
  })
  it('zaehlt Durchklicken unter 2 s nicht', () => {
    expect(aufrufVon({ memberId: null, pfad: '/plan', von: '/', seit: 0, jetzt: 1200, breite: 400 })).toBeNull()
  })
  it('deckelt bei 30 Minuten und erkennt das Geraet', () => {
    const a = aufrufVon({ memberId: 'm', pfad: '/client/1', von: '/plan', seit: 0, jetzt: 3 * 3600 * 1000, breite: 1200 })!
    expect(a).toMatchObject({ pfad: '/client', von: '/plan', dauer_s: 1800, geraet: 'desktop', member_id: 'm' })
  })
})
