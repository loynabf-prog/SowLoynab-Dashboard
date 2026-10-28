import { describe, it, expect } from 'vitest'
import { eingangVon, istVideo, statusText } from '../produktion'

describe('produktion', () => {
  it('Briefkasten liegt oben in 1 Briefkasten/<Kunde>', () => {
    expect(eingangVon('/Sow & Loynab Media/Kunden/Kebab Kumpels')).toBe('/Sow & Loynab Media/1 Briefkasten/Kebab Kumpels')
    expect(eingangVon('/Sow & Loynab Media/Kunden/Kebab Kumpels/')).toBe('/Sow & Loynab Media/1 Briefkasten/Kebab Kumpels')
    expect(eingangVon('/Sow & Loynab Media/Kunden/_Eigener Account')).toBe('/Sow & Loynab Media/1 Briefkasten/_Eigener Account')
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
