import { describe, it, expect } from 'vitest'
import { mitHashtags } from '../captionVorgabe'

describe('mitHashtags', () => {
  it('haengt die festen Hashtags an', () => {
    expect(mitHashtags('Lecker!', '#muenster #food')).toBe('Lecker!\n#muenster #food')
  })

  it('laesst die Caption in Ruhe, wenn keine festen hinterlegt sind', () => {
    expect(mitHashtags('Lecker!', '')).toBe('Lecker!')
    expect(mitHashtags('Lecker!')).toBe('Lecker!')
  })

  it('haengt keinen Hashtag doppelt an', () => {
    const c = 'Lecker!\n#food #pasta'
    expect(mitHashtags(c, '#muenster #food')).toBe('Lecker!\n#food #pasta\n#muenster')
  })

  it('ignoriert Gross- und Kleinschreibung beim Vergleich', () => {
    expect(mitHashtags('Text #Muenster', '#muenster')).toBe('Text #Muenster')
  })

  it('kommt mit Umlauten klar', () => {
    expect(mitHashtags('Text #münster', '#münster #essen')).toBe('Text #münster\n#essen')
  })

  it('schneidet Leerraum weg', () => {
    expect(mitHashtags('  Lecker!  \n', '  #food  ')).toBe('Lecker!\n#food')
  })

  it('gibt nichts aus, wenn alle festen schon drinstehen', () => {
    expect(mitHashtags('Text #a #b', '#a #b')).toBe('Text #a #b')
  })
})
