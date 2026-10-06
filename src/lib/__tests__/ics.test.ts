import { describe, it, expect } from 'vitest'
import {
  escape, falte, datumKompakt, zeitKompakt, tagDanach, baueIcs,
} from '../../../supabase/functions/_shared/ics'

describe('escape', () => {
  it('maskiert Semikolon und Komma', () => {
    expect(escape('Dreh; dann Schnitt, dann Post')).toBe('Dreh\; dann Schnitt\\, dann Post')
  })
  it('macht aus Zeilenumbruechen \\n', () => {
    expect(escape('oben\nunten')).toBe('oben\\nunten')
  })
  it('maskiert den Backslash zuerst', () => {
    expect(escape('a\\b;c')).toBe('a\\\\b\;c')
  })
  it('laesst harmlosen Text in Ruhe', () => {
    expect(escape('Schleckofatz')).toBe('Schleckofatz')
  })
})

describe('falte', () => {
  it('laesst kurze Zeilen stehen', () => {
    expect(falte('SUMMARY:kurz')).toBe('SUMMARY:kurz')
  })
  it('bricht lange Zeilen mit Leerzeichen um', () => {
    const lang = 'SUMMARY:' + 'x'.repeat(200)
    const g = falte(lang)
    expect(g).toContain('\r\n ')
    for (const z of g.split('\r\n')) expect(z.length).toBeLessThanOrEqual(75)
  })
  it('verliert beim Falten kein Zeichen', () => {
    const lang = 'A'.repeat(300)
    expect(falte(lang).split('\r\n').map((z, i) => (i ? z.slice(1) : z)).join('')).toBe(lang)
  })
})

describe('Datums-Umrechnung', () => {
  it('schreibt das Datum kompakt', () => {
    expect(datumKompakt('2026-10-14')).toBe('20261014')
  })
  it('schreibt Datum und Uhrzeit kompakt', () => {
    expect(zeitKompakt('2026-10-14', '14:30')).toBe('20261014T143000')
  })
  it('vertraegt einstellige Stunden', () => {
    expect(zeitKompakt('2026-10-14', '9:05')).toBe('20261014T090500')
  })
  it('rechnet den Folgetag -- auch ueber Monats- und Jahresgrenzen', () => {
    expect(tagDanach('2026-10-14')).toBe('2026-10-15')
    expect(tagDanach('2026-10-31')).toBe('2026-11-01')
    expect(tagDanach('2026-12-31')).toBe('2027-01-01')
    expect(tagDanach('2028-02-28')).toBe('2028-02-29')
  })
})

const stempel = '20261006T120000Z'
const bau = (t: Parameters<typeof baueIcs>[0]['termine']) =>
  baueIcs({ name: 'Test', termine: t, stempel })

describe('baueIcs', () => {
  it('baut einen gueltigen Rahmen', () => {
    const s = bau([])
    expect(s.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(s.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(s).toContain('VERSION:2.0')
    expect(s).toContain('X-WR-CALNAME:Test')
  })

  it('trennt Zeilen mit CRLF -- so will es die Norm', () => {
    expect(bau([]).includes('\r\n')).toBe(true)
  })

  it('schreibt einen ganztaegigen Termin mit Ende am Folgetag', () => {
    const s = bau([{ uid: 'a', titel: 'Spiel', start: '2026-10-14' }])
    expect(s).toContain('DTSTART;VALUE=DATE:20261014')
    expect(s).toContain('DTEND;VALUE=DATE:20261015')
  })

  it('schreibt einen Termin mit Uhrzeit in deutscher Zeitzone', () => {
    const s = bau([{ uid: 'b', titel: 'Dreh', start: '2026-10-14', startZeit: '14:00', endZeit: '16:00' }])
    expect(s).toContain('DTSTART;TZID=Europe/Berlin:20261014T140000')
    expect(s).toContain('DTEND;TZID=Europe/Berlin:20261014T160000')
  })

  it('nimmt ohne Endzeit eine Stunde an', () => {
    const s = bau([{ uid: 'c', titel: 'Termin', start: '2026-10-14', startZeit: '09:00' }])
    expect(s).toContain('DTEND;TZID=Europe/Berlin:20261014T100000')
  })

  it('haengt die Kennung an, damit nichts doppelt angelegt wird', () => {
    expect(bau([{ uid: 'xyz', titel: 'T', start: '2026-10-14' }])).toContain('UID:xyz@sowloynab.de')
  })

  it('maskiert Sonderzeichen im Titel', () => {
    const s = bau([{ uid: 'd', titel: 'Dreh; Schnitt, Post', start: '2026-10-14' }])
    expect(s).toContain('SUMMARY:Dreh\; Schnitt\\, Post')
  })

  it('nimmt Ort und Beschreibung mit, wenn es sie gibt', () => {
    const s = bau([{ uid: 'e', titel: 'T', start: '2026-10-14', ort: 'Münster', beschreibung: 'Notiz' }])
    expect(s).toContain('LOCATION:Münster')
    expect(s).toContain('DESCRIPTION:Notiz')
  })

  it('laesst leere Felder weg, statt sie leer zu schreiben', () => {
    const s = bau([{ uid: 'f', titel: 'T', start: '2026-10-14', ort: null, beschreibung: null }])
    expect(s).not.toContain('LOCATION:')
    expect(s).not.toContain('DESCRIPTION:')
  })

  it('schreibt mehrere Termine hintereinander', () => {
    const s = bau([
      { uid: 'g1', titel: 'Eins', start: '2026-10-14' },
      { uid: 'g2', titel: 'Zwei', start: '2026-10-15' },
    ])
    expect(s.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(s.match(/END:VEVENT/g)).toHaveLength(2)
  })

  it('schreibt einen mehrtaegigen Termin bis zum Folgetag des Endes', () => {
    const s = bau([{ uid: 'h', titel: 'Urlaub', start: '2026-10-12', ende: '2026-10-16' }])
    expect(s).toContain('DTSTART;VALUE=DATE:20261012')
    expect(s).toContain('DTEND;VALUE=DATE:20261017')
  })
})
