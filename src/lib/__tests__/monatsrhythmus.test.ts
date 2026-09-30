import { describe, it, expect } from 'vitest'
import {
  monatsTitel, monatVersetzt, tageImMonat, vorschlagAbstand,
  gleichmaessigeTermine, wochentagTermine, terminVorschau, platzhalterNamen,
} from '../monatsrhythmus'

describe('Monats-Grundlagen', () => {
  it('benennt den Monat', () => {
    expect(monatsTitel('2026-10')).toBe('Oktober 2026')
  })
  it('zaehlt die Tage', () => {
    expect(tageImMonat('2026-10')).toBe(31)
    expect(tageImMonat('2026-11')).toBe(30)
    expect(tageImMonat('2026-02')).toBe(28)
    expect(tageImMonat('2028-02')).toBe(29) // Schaltjahr
  })
  it('springt ueber den Jahreswechsel', () => {
    expect(monatVersetzt('2026-12', 1)).toBe('2027-01')
    expect(monatVersetzt('2026-01', -1)).toBe('2025-12')
    expect(monatVersetzt('2026-10', 0)).toBe('2026-10')
  })
})

describe('vorschlagAbstand', () => {
  it('10 Videos im Oktober -> alle 3 Tage', () => {
    expect(vorschlagAbstand('2026-10', 10)).toBe(3)
  })
  it('16 Videos im Oktober -> alle 2 Tage', () => {
    expect(vorschlagAbstand('2026-10', 16)).toBe(2)
  })
  it('8 Videos im Oktober -> alle 4 Tage', () => {
    expect(vorschlagAbstand('2026-10', 8)).toBe(4)
  })
  it('4 Videos im November -> alle 8 Tage', () => {
    expect(vorschlagAbstand('2026-11', 4)).toBe(8)
  })
  it('haelt den Abstand so klein, dass alles in den Monat passt', () => {
    // Start am 20. laesst nur noch 11 Tage -- der Abstand muss schrumpfen.
    expect(vorschlagAbstand('2026-10', 6, 20)).toBe(2)
  })
  it('wird nie kleiner als 1', () => {
    expect(vorschlagAbstand('2026-10', 40)).toBe(1)
  })
  it('ein einzelnes Video braucht keinen Abstand', () => {
    expect(vorschlagAbstand('2026-10', 1)).toBe(1)
  })
})

describe('gleichmaessigeTermine', () => {
  it('10 Videos, Abstand 3, ab dem 1. -> 1., 4., 7. …', () => {
    const t = gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 10, startTag: 1, abstand: 3 })
    expect(t).toHaveLength(10)
    expect(t.slice(0, 3)).toEqual(['2026-10-01', '2026-10-04', '2026-10-07'])
    expect(t[9]).toBe('2026-10-28')
  })
  it('der Starttag verschiebt die ganze Reihe', () => {
    const t = gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 3, startTag: 2, abstand: 3 })
    expect(t).toEqual(['2026-10-02', '2026-10-05', '2026-10-08'])
  })
  it('16 Videos mit dem vorgeschlagenen Abstand fuellen den Monat', () => {
    const abstand = vorschlagAbstand('2026-10', 16)
    const t = gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 16, startTag: 1, abstand })
    expect(t).toHaveLength(16)
    expect(t[15]).toBe('2026-10-31')
  })
  it('bricht am Monatsende ab, statt in den naechsten zu rutschen', () => {
    const t = gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 10, startTag: 25, abstand: 3 })
    expect(t).toEqual(['2026-10-25', '2026-10-28', '2026-10-31'])
  })
  it('ohne Anzahl kommt nichts zurueck', () => {
    expect(gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 0, startTag: 1, abstand: 3 })).toEqual([])
  })
  it('faengt einen unsinnigen Abstand ab', () => {
    const t = gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 3, startTag: 1, abstand: 0 })
    expect(t).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })
})

describe('wochentagTermine', () => {
  it('nimmt nur die gewaehlten Wochentage', () => {
    // 1.10.2026 ist ein Donnerstag.
    const t = wochentagTermine({ monatsKey: '2026-10', anzahl: 4, tage: [3] }) // Do
    expect(t).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'])
  })
  it('mehrere Wochentage kommen in Datumsreihenfolge', () => {
    const t = wochentagTermine({ monatsKey: '2026-10', anzahl: 4, tage: [1, 3] }) // Di + Do
    expect(t).toEqual(['2026-10-01', '2026-10-06', '2026-10-08', '2026-10-13'])
  })
  it('hoert bei der gewuenschten Menge auf', () => {
    expect(wochentagTermine({ monatsKey: '2026-10', anzahl: 2, tage: [0, 1, 2, 3, 4] })).toHaveLength(2)
  })
  it('liefert weniger, wenn der Monat nicht mehr hergibt', () => {
    const t = wochentagTermine({ monatsKey: '2026-10', anzahl: 10, tage: [6] }) // nur Sonntage
    expect(t.length).toBeLessThan(10)
  })
  it('ohne Wochentag gibt es nichts', () => {
    expect(wochentagTermine({ monatsKey: '2026-10', anzahl: 5, tage: [] })).toEqual([])
  })
  it('startet auf Wunsch erst spaeter im Monat', () => {
    const t = wochentagTermine({ monatsKey: '2026-10', anzahl: 2, tage: [3], abTag: 9 })
    expect(t).toEqual(['2026-10-15', '2026-10-22'])
  })
})

describe('terminVorschau', () => {
  it('zaehlt kurze Reihen komplett auf', () => {
    expect(terminVorschau(['2026-10-01', '2026-10-04'])).toBe('1., 4.')
  })
  it('kuerzt lange Reihen und nennt den letzten Termin', () => {
    const t = gleichmaessigeTermine({ monatsKey: '2026-10', anzahl: 10, startTag: 1, abstand: 3 })
    expect(terminVorschau(t)).toBe('1., 4., 7., 10., 13., 16. … 28.')
  })
  it('vertraegt eine leere Reihe', () => {
    expect(terminVorschau([])).toBe('')
  })
})

describe('platzhalterNamen', () => {
  it('nummeriert ab eins durch', () => {
    expect(platzhalterNamen('2026-10', 3)).toEqual(['Oktober 1', 'Oktober 2', 'Oktober 3'])
  })
  it('setzt hinter vorhandenen Karten fort', () => {
    expect(platzhalterNamen('2026-10', 2, 5)).toEqual(['Oktober 6', 'Oktober 7'])
  })
})
