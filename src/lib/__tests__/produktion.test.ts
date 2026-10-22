import { describe, it, expect } from 'vitest'
import { eingangVon, istVideo, statusText } from '../produktion'

describe('produktion', () => {
  it('Eingang liegt im Kundenordner', () => {
    expect(eingangVon('/Sow & Loynab Media/01_Kunden/Kebab Kumpels')).toBe('/Sow & Loynab Media/01_Kunden/Kebab Kumpels/_Eingang')
    expect(eingangVon('/Sow & Loynab Media/01_Kunden/Kebab Kumpels/')).toBe('/Sow & Loynab Media/01_Kunden/Kebab Kumpels/_Eingang')
  })
  it('zaehlt nur Videodateien', () => {
    expect(istVideo('IMG_4711.MOV')).toBe(true)
    expect(istVideo('clip.mp4')).toBe(true)
    expect(istVideo('.DS_Store')).toBe(false)
    expect(istVideo('notiz.md')).toBe(false)
  })
  it('Status ohne Druck, Fehler mit Grund', () => {
    expect(statusText({ status: 'wartet', schritt: null, notiz: null })).toMatch(/Wartet/)
    expect(statusText({ status: 'laeuft', schritt: 'schneidet Video 2 von 5', notiz: null })).toBe('Läuft: schneidet Video 2 von 5')
    expect(statusText({ status: 'fehler', schritt: null, notiz: 'PC nicht erreichbar' })).toBe('Hängt: PC nicht erreichbar')
  })
})
