import { describe, it, expect } from 'vitest'
import { NUR_POSTEN } from '../fristen'
import { lageSatz, tagesLage, zeitAus, type LageAufgabe, type LageTermin, type LageVideo } from '../tageslage'

const HEUTE = '2026-10-18'
const JETZT = '09:00'

const video = (over: Partial<LageVideo> = {}): LageVideo => ({
  id: 'v1', title: 'Pasta-Reel', status: 'todo', scheduled_date: null,
  clients: { name: 'Bella' }, ...over,
})
const leer = { videos: [], termine: [], aufgaben: [] }

describe('tagesLage — was brennt', () => {
  it('nimmt ein verpasstes Posting auf', () => {
    const l = tagesLage({ ...leer, videos: [video({ scheduled_date: '2026-10-16' })] }, HEUTE, JETZT)
    expect(l.brennt).toHaveLength(1)
    expect(l.brennt[0].text).toContain('Posting verpasst')
    expect(l.ruhig).toBe(false)
  })
  it('nimmt eine ueberfaellige Aufgabe auf', () => {
    const a: LageAufgabe = { id: 'a1', title: 'Rechnung schicken', due_date: '2026-10-15' }
    const l = tagesLage({ ...leer, aufgaben: [a] }, HEUTE, JETZT)
    expect(l.brennt[0].text).toContain('Überfällig seit 3 Tagen')
  })
  it('meldet ein Video, dessen Post-Zeit heute vorbei ist', () => {
    const v = video({ scheduled_date: HEUTE, scheduled_time: '08:00', prep_scheduled: true })
    const l = tagesLage({ ...leer, videos: [v] }, HEUTE, '09:30')
    expect(l.brennt).toHaveLength(1)
    expect(l.brennt[0].text).toContain('08:00')
  })
})

describe('tagesLage — was ist heute', () => {
  it('zeigt Termine von heute, nicht die von morgen', () => {
    const termine: LageTermin[] = [
      { id: 'e1', title: 'Abstimmung', kind: 'termin', starts_on: HEUTE },
      { id: 'e2', title: 'Spaeter', kind: 'termin', starts_on: '2026-10-19' },
    ]
    const l = tagesLage({ ...leer, termine }, HEUTE, JETZT)
    expect(l.heute.map((p) => p.titel)).toEqual(['Abstimmung'])
  })
  it('kennzeichnet einen Drehtag mit der Videoanzahl', () => {
    const t: LageTermin = { id: 'e1', title: 'Dreh Herbstkarte', kind: 'dreh', starts_on: HEUTE, planned_videos: 5 }
    const l = tagesLage({ ...leer, termine: [t] }, HEUTE, JETZT)
    expect(l.heute[0].art).toBe('drehtag')
    expect(l.heute[0].text).toContain('5 Videos')
  })
  it.skipIf(NUR_POSTEN)('holt ein Video nach vorn, dessen Schnitt-Frist heute endet', () => {
    // Posting in 3 Tagen, gedreht aber nicht geschnitten -> Schnitt-Frist ist heute
    const v = video({ scheduled_date: '2026-10-21', prep_shot: true })
    const l = tagesLage({ ...leer, videos: [v] }, HEUTE, JETZT)
    expect([...l.brennt, ...l.heute]).toHaveLength(1)
    expect([...l.brennt, ...l.heute][0].art).toBe('schnitt')
  })
  it.skipIf(NUR_POSTEN)('das ist der Fall, den die alte Startseite verschluckt hat', () => {
    // Das Video wird NICHT heute gepostet -- es stand deshalb nirgends.
    const v = video({ scheduled_date: '2026-10-21', prep_shot: true })
    expect(v.scheduled_date).not.toBe(HEUTE)
    const l = tagesLage({ ...leer, videos: [v] }, HEUTE, JETZT)
    expect(l.ruhig).toBe(false)
  })
})

describe('tagesLage — Vorarbeit', () => {
  it.skipIf(NUR_POSTEN)('schlaegt vor, was man schon schneiden koennte', () => {
    const v = video({ scheduled_date: '2026-11-20', prep_shot: true })
    const l = tagesLage({ ...leer, videos: [v] }, HEUTE, JETZT)
    expect(l.brennt).toHaveLength(0)
    expect(l.heute).toHaveLength(0)
    expect(l.vorarbeit).toHaveLength(1)
    expect(l.vorarbeit[0].art).toBe('schnitt')
    expect(l.ruhig).toBe(true)
  })
  it('schlaegt nichts vor, was man gar nicht anfassen kann', () => {
    // Weder gedreht noch Drehtag: da ist nichts vorzuziehen
    const v = video({ scheduled_date: '2026-11-20' })
    expect(tagesLage({ ...leer, videos: [v] }, HEUTE, JETZT).vorarbeit).toHaveLength(0)
  })
  it('zaehlt ein Video ohne Posting-Tag nirgends mit', () => {
    const l = tagesLage({ ...leer, videos: [video({ prep_shot: true })] }, HEUTE, JETZT)
    expect(l.brennt.length + l.heute.length + l.vorarbeit.length).toBe(0)
  })
  it.skipIf(NUR_POSTEN)('stellt Schneiden vor Einplanen', () => {
    const videos = [
      video({ id: 'a', title: 'Einplanen', scheduled_date: '2026-11-20', prep_shot: true, prep_edited: true }),
      video({ id: 'b', title: 'Schneiden', scheduled_date: '2026-11-20', prep_shot: true }),
    ]
    const l = tagesLage({ ...leer, videos }, HEUTE, JETZT)
    expect(l.vorarbeit.map((p) => p.art)).toEqual(['schnitt', 'planung'])
  })
  it('laesst gepostete Videos ganz weg', () => {
    const v = video({ status: 'posted', scheduled_date: '2026-10-10' })
    const l = tagesLage({ ...leer, videos: [v] }, HEUTE, JETZT)
    expect(l.brennt.length + l.heute.length + l.vorarbeit.length).toBe(0)
  })
})

describe('tagesLage — Reihenfolge', () => {
  it('sortiert nach Uhrzeit, Punkte ohne Uhrzeit hinten', () => {
    const termine: LageTermin[] = [
      { id: 'e1', title: 'Ohne Zeit', kind: 'termin', starts_on: HEUTE },
      { id: 'e2', title: 'Nachmittag', kind: 'termin', starts_on: HEUTE, starts_at: '2026-10-18T13:00:00Z' },
      { id: 'e3', title: 'Frueh', kind: 'termin', starts_on: HEUTE, starts_at: '2026-10-18T06:00:00Z' },
    ]
    const l = tagesLage({ ...leer, termine }, HEUTE, JETZT)
    expect(l.heute.map((p) => p.titel)).toEqual(['Frueh', 'Nachmittag', 'Ohne Zeit'])
  })
})

describe('zeitAus', () => {
  it('rechnet in deutsche Zeit um', () => {
    expect(zeitAus('2026-10-18T06:00:00Z')).toBe('08:00')
  })
  it('kommt mit nichts klar', () => {
    expect(zeitAus(null)).toBeNull()
    expect(zeitAus('kaputt')).toBeNull()
  })
})

describe('lageSatz', () => {
  const l = (o: Partial<ReturnType<typeof tagesLage>>) =>
    ({ brennt: [], heute: [], vorarbeit: [], ruhig: true, ...o }) as ReturnType<typeof tagesLage>
  it('nennt zuerst, was brennt', () => {
    expect(lageSatz(l({ brennt: [{} as never] }))).toBe('1 Sache brennt')
    expect(lageSatz(l({ brennt: [{} as never, {} as never] }))).toBe('2 Sachen brennen')
  })
  it('sonst die Punkte fuer heute', () => {
    expect(lageSatz(l({ heute: [{} as never, {} as never] }))).toBe('2 Punkte für heute')
  })
  it('bei Ruhe den Hinweis aufs Vorarbeiten', () => {
    expect(lageSatz(l({ vorarbeit: [{} as never] }))).toContain('Vorarbeiten')
  })
  it('und wenn wirklich nichts da ist', () => {
    expect(lageSatz(l({}))).toBe('Alles sauber. Nichts offen.')
  })
})

import { buendeln, anzahl, proKundeSatz, nachKunde } from '../tageslage'
import { proKunde } from '../../../supabase/functions/daily-reminders/brennt'
import type { Punkt } from '../tageslage'

describe('buendeln', () => {
  const pk = (id: string, art: Punkt['art'], kunde: string | null, extra: Partial<Punkt> = {}): Punkt => ({
    key: 'v-' + id, id, art, titel: id, kunde, zeit: null, text: 'Frist ' + id, ampel: 'rot', ziel: '/produktion',
    clientId: kunde ? 'c-' + kunde : null, ...extra,
  })
  it('macht aus mehreren Dreh-Videos eines Kunden eine Zeile mit Anzahl', () => {
    const r = buendeln([pk('1', 'dreh', 'Kebab Kumpels'), pk('2', 'dreh', 'Kebab Kumpels'), pk('3', 'dreh', 'Hajo')])
    expect(r).toHaveLength(2)
    expect(r[0].titel).toBe('Kebab Kumpels: 2 Videos noch zu drehen')
    expect(r[0].gruppe).toHaveLength(2)
    expect(r[1].gruppe).toBeUndefined()
    expect(anzahl(r)).toBe(3)
  })
  it('trennt nach Schritt und laesst Posts einzeln', () => {
    const r = buendeln([pk('1', 'dreh', 'A'), pk('2', 'schnitt', 'A'), pk('3', 'posten', 'A'), pk('4', 'posten', 'A')])
    expect(r).toHaveLength(4)
  })
  it('dringendstes Video zuerst, Ampel uebernimmt das Schlimmste', () => {
    const r = buendeln([pk('1', 'schnitt', 'A', { ampel: 'gelb', frist: '2026-10-30' }), pk('2', 'schnitt', 'A', { ampel: 'rot', frist: '2026-10-25' })])
    expect(r[0].ampel).toBe('rot')
    expect(r[0].gruppe![0].id).toBe('2')
    expect(r[0].titel).toBe('A: 2 Videos noch zu schneiden')
  })
  it('alle am selben Drehtag: sagt das Datum', () => {
    const r = buendeln([pk('1', 'dreh', 'A', { drehtag: '2026-10-22' }), pk('2', 'dreh', 'A', { drehtag: '2026-10-22' })])
    expect(r[0].text).toBe('Drehtag am 22.10.')
    expect(r[0].drehtag).toBe('2026-10-22')
  })
})

describe('pro Kunde', () => {
  const namen = ['A', 'B', 'A', 'C', 'A', 'B', 'D', null]
  it('App und Morgen-Push sagen dasselbe', () => {
    expect(proKundeSatz(namen)).toBe(proKunde(namen))
    expect(proKundeSatz(namen)).toBe('A 3 · B 2 · C 1 +2 weitere')
  })
  it('nachKunde: groesste Gruppe zuerst', () => {
    expect(nachKunde(namen, (x) => x).map((g) => g.kunde)).toEqual(['A', 'B', 'C', 'D', 'Ohne Kunde'])
  })
})
