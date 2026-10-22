import { describe, it, expect, vi } from 'vitest'
vi.mock('../funktion', () => ({ rufeFunktion: vi.fn() }))
import { sortiert, brotkrumen, groesse, relativ, dropboxWebLink, type Eintrag } from '../medien'

const e = (name: string, ordner = false): Eintrag => ({
  name, pfad: `/x/${name}`, ordner, art: ordner ? 'ordner' : 'video', groesse: null, geaendert: null,
})

describe('sortiert', () => {
  it('Ordner vor Dateien, Drehtage neueste zuerst', () => {
    const r = sortiert([e('b.mp4'), e('2026-09_Drehtag-01', true), e('2026-10_Drehtag-01', true), e('a.mp4')])
    expect(r.map((x) => x.name)).toEqual(['2026-10_Drehtag-01', '2026-09_Drehtag-01', 'a.mp4', 'b.mp4'])
  })
  it('nummerierte Ordner natuerlich sortiert', () => {
    const r = sortiert([e('10_X', true), e('02_Rohmaterial', true), e('01_Skripte', true)])
    expect(r.map((x) => x.name)).toEqual(['01_Skripte', '02_Rohmaterial', '10_X'])
  })
})

describe('brotkrumen', () => {
  it('vom Kundenordner bis hierher', () => {
    const k = '/Sow & Loynab Media/Kunden/Kebab Kumpels'
    expect(brotkrumen(k, `${k}/2026-10_Drehtag-01/03_Schnitt`).map((b) => b.name))
      .toEqual(['Kebab Kumpels', '2026-10_Drehtag-01', '03_Schnitt'])
  })
})

describe('Helfer', () => {
  it('groesse', () => {
    expect(groesse(500)).toBe('1 KB')
    expect(groesse(5 * 1024 ** 2)).toBe('5.0 MB')
    expect(groesse(3.2 * 1024 ** 3)).toBe('3.2 GB')
  })
  it('relativ', () => {
    expect(relativ('/a/K', '/a/K')).toBe('/')
    expect(relativ('/a/K', '/a/K/x/y')).toBe('x/y')
  })
  it('Weblink kodiert Sonderzeichen', () => {
    expect(dropboxWebLink('/Sow & Loynab Media/Kunden')).toBe('https://www.dropbox.com/home/Sow%20%26%20Loynab%20Media/Kunden')
  })
})
