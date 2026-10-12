import { describe, it, expect } from 'vitest'
import { hatUnterschrift } from '../unterschrift'

describe('hatUnterschrift', () => {
  it('erkennt eine gezeichnete Unterschrift', () => {
    expect(hatUnterschrift('data:image/png;base64,' + 'A'.repeat(2000))).toBe(true)
  })
  it('wertet ein leeres Feld nicht als Unterschrift', () => {
    // Ein unberuehrtes Canvas liefert eine sehr kurze Data-URL
    expect(hatUnterschrift('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
  })
  it('kommt mit nichts klar', () => {
    expect(hatUnterschrift(null)).toBe(false)
    expect(hatUnterschrift(undefined)).toBe(false)
    expect(hatUnterschrift('')).toBe(false)
  })
  it('nimmt nur Bilder', () => {
    expect(hatUnterschrift('irgendwas' + 'x'.repeat(2000))).toBe(false)
  })
})
