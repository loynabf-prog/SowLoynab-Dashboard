import { describe, it, expect } from 'vitest'
import { datumAnzeige, deuteZeile, naechsterWochentag, zieheErwaehnte, zieheTermin } from '../chatBefehl'

// Donnerstag, 22.10.2026
const HEUTE = '2026-10-22'
const TEAM = [
  { id: 'f', name: 'Fassie' },
  { id: 'l', name: 'Lion' },
]

describe('naechsterWochentag', () => {
  it('Freitag am Donnerstag ist morgen', () => {
    expect(naechsterWochentag(HEUTE, 5)).toBe('2026-10-23')
  })
  it('Donnerstag am Donnerstag ist in einer Woche', () => {
    expect(naechsterWochentag(HEUTE, 4)).toBe('2026-10-29')
  })
})

describe('zieheTermin', () => {
  it('bis Freitag', () => {
    expect(zieheTermin('Rechnung schreiben bis Freitag', HEUTE)).toEqual({ rest: 'Rechnung schreiben', datum: '2026-10-23', uhrzeit: null })
  })
  it('morgen 14 Uhr', () => {
    expect(zieheTermin('Drehtag klären morgen 14 Uhr', HEUTE)).toEqual({ rest: 'Drehtag klären', datum: '2026-10-23', uhrzeit: '14:00' })
  })
  it('Datum mit Punkten, auch ohne Jahr im naechsten Jahr', () => {
    expect(zieheTermin('Vertrag am 5.1.', HEUTE).datum).toBe('2027-01-05')
    expect(zieheTermin('Vertrag bis zum 30.10.', HEUTE).datum).toBe('2026-10-30')
  })
  it('Uhrzeit mit Doppelpunkt allein heisst heute', () => {
    expect(zieheTermin('Call um 16:30', HEUTE)).toEqual({ rest: 'Call', datum: HEUTE, uhrzeit: '16:30' })
  })
  it('nächste Woche = Montag', () => {
    expect(zieheTermin('Angebot nächste Woche', HEUTE).datum).toBe('2026-10-26')
  })
  it('in 3 Tagen', () => {
    expect(zieheTermin('Feedback in 3 Tagen', HEUTE).datum).toBe('2026-10-25')
  })
  it('laesst Zahlen im Titel stehen', () => {
    expect(zieheTermin('8 Videos schneiden', HEUTE)).toEqual({ rest: '8 Videos schneiden', datum: null, uhrzeit: null })
  })
  it('ungueltiges Datum wird nicht verschluckt', () => {
    expect(zieheTermin('Termin 31.11.', HEUTE).datum).toBeNull()
  })
})

describe('zieheErwaehnte', () => {
  it('findet Personen und Claude', () => {
    expect(zieheErwaehnte('@lion und @claude schaut mal', TEAM)).toEqual({ rest: 'und schaut mal', wer: ['l'], claude: true })
  })
  it('laesst Unbekannte stehen', () => {
    expect(zieheErwaehnte('Story bei @kebabkumpels', TEAM).rest).toBe('Story bei @kebabkumpels')
  })
})

describe('deuteZeile', () => {
  it('normaler Text', () => {
    expect(deuteZeile('Moin, alles klar?', TEAM, HEUTE)).toEqual({ art: 'text' })
  })
  it('/aufgabe mit Person, Datum, Dringlichkeit', () => {
    expect(deuteZeile('/aufgabe @Lion Rechnung Kebab Kumpels bis Freitag dringend', TEAM, HEUTE)).toEqual({
      art: 'aufgabe', titel: 'Rechnung Kebab Kumpels', wer: ['l'], datum: '2026-10-23', uhrzeit: null, prioritaet: 3,
    })
  })
  it('/a als Kurzform, Titel gross', () => {
    const b = deuteZeile('/a drehplan machen', TEAM, HEUTE)
    expect(b).toMatchObject({ art: 'aufgabe', titel: 'Drehplan machen', wer: [], datum: null, prioritaet: 1 })
  })
  it('wichtig = Prioritaet 2', () => {
    expect(deuteZeile('/aufgabe Logo holen wichtig', TEAM, HEUTE)).toMatchObject({ titel: 'Logo holen', prioritaet: 2 })
  })
  it('@claude irgendwo im Text', () => {
    expect(deuteZeile('@claude was brennt?', TEAM, HEUTE)).toEqual({ art: 'claude', frage: 'was brennt?' })
  })
  it('/claude', () => {
    expect(deuteZeile('/claude Hallo', TEAM, HEUTE)).toEqual({ art: 'claude', frage: 'Hallo' })
  })
  it('unbekannter Befehl bleibt Text', () => {
    expect(deuteZeile('/shrug', TEAM, HEUTE)).toEqual({ art: 'text' })
  })
})

describe('datumAnzeige', () => {
  it('heute, morgen, sonst Wochentag', () => {
    expect(datumAnzeige(HEUTE, HEUTE)).toBe('heute')
    expect(datumAnzeige('2026-10-23', HEUTE)).toBe('morgen')
    expect(datumAnzeige('2026-10-27', HEUTE)).toBe('Di 27.10.')
    expect(datumAnzeige(null, HEUTE)).toBe('')
  })
})
