import { describe, it, expect } from 'vitest'
import { pruefe, beschreibe, type Schritt } from '../assistent'

const name = () => 'Pizzeria Bella'

describe('pruefe — ein Plan muss stimmen, bevor etwas passiert', () => {
  it('laesst einen sauberen Plan durch', () => {
    const plan: Schritt[] = [
      { art: 'kunde_anlegen', ref: 'k1', name: 'Pizzeria Bella', honorar: 1200, videos_pro_monat: 12 },
      { art: 'monatsplan', client_ref: 'k1', monat: '2026-10', anzahl: 12 },
    ]
    expect(pruefe(plan)).toEqual([])
  })

  it('beanstandet einen Kunden ohne Namen', () => {
    expect(pruefe([{ art: 'kunde_anlegen', ref: 'k1', name: '  ' }])[0]).toMatch(/keinen Namen/)
  })

  it('beanstandet einen Verweis auf einen Kunden, den es im Plan nicht gibt', () => {
    const plan: Schritt[] = [{ art: 'monatsplan', client_ref: 'k9', monat: '2026-10', anzahl: 5 }]
    expect(pruefe(plan)[0]).toMatch(/vorher nicht angelegt/)
  })

  it('akzeptiert eine echte Kunden-Id ohne vorherigen Schritt', () => {
    const plan: Schritt[] = [{ art: 'monatsplan', client_id: 'abc', monat: '2026-10', anzahl: 5 }]
    expect(pruefe(plan)).toEqual([])
  })

  it('besteht auf der richtigen Reihenfolge', () => {
    const plan: Schritt[] = [
      { art: 'monatsplan', client_ref: 'k1', monat: '2026-10', anzahl: 5 },
      { art: 'kunde_anlegen', ref: 'k1', name: 'Zu spät' },
    ]
    expect(pruefe(plan)[0]).toMatch(/vorher nicht angelegt/)
  })

  it('beanstandet einen kaputten Monat', () => {
    const plan: Schritt[] = [{ art: 'monatsplan', client_id: 'a', monat: 'Oktober', anzahl: 5 }]
    expect(pruefe(plan)[0]).toMatch(/ist kein Monat/)
  })

  it('beanstandet eine fehlende Menge', () => {
    const plan: Schritt[] = [{ art: 'monatsplan', client_id: 'a', monat: '2026-10', anzahl: 0 }]
    expect(pruefe(plan)[0]).toMatch(/Keine Videomenge/)
  })

  it('faengt eine unsinnig grosse Menge ab', () => {
    const plan: Schritt[] = [{ art: 'monatsplan', client_id: 'a', monat: '2026-10', anzahl: 500 }]
    expect(pruefe(plan)[0]).toMatch(/zu viel/)
  })

  it('beanstandet ein kaputtes Datum', () => {
    const plan: Schritt[] = [{ art: 'video_anlegen', client_id: 'a', titel: 'T', datum: 'morgen' }]
    expect(pruefe(plan)[0]).toMatch(/ist kein Datum/)
  })

  it('laesst eine Aufgabe ohne Kunden zu — die gibt es wirklich', () => {
    expect(pruefe([{ art: 'aufgabe_anlegen', titel: 'Steuer machen' }])).toEqual([])
  })

  it('beanstandet ein Video ohne Kunden', () => {
    const plan: Schritt[] = [{ art: 'video_anlegen', titel: 'T', datum: '2026-10-01' }]
    expect(pruefe(plan)[0]).toMatch(/Kein Kunde/)
  })

  it('beanstandet einen Termin ohne Datum', () => {
    const plan: Schritt[] = [{ art: 'termin_anlegen', titel: 'Schicht', kind: 'arbeit', von: 'Freitag' }]
    expect(pruefe(plan)[0]).toMatch(/ist kein Datum/)
  })

  it('sammelt mehrere Beanstandungen statt bei der ersten aufzuhoeren', () => {
    const plan: Schritt[] = [
      { art: 'kunde_anlegen', ref: 'k1', name: '' },
      { art: 'monatsplan', client_ref: 'k2', monat: 'bla', anzahl: 0 },
    ]
    expect(pruefe(plan).length).toBeGreaterThan(2)
  })
})

describe('beschreibe — die Vorschau muss im Klartext sagen, was passiert', () => {
  it('beschreibt einen neuen Kunden mit Honorar und Menge', () => {
    const t = beschreibe({ art: 'kunde_anlegen', ref: 'k1', name: 'Bella', honorar: 1200, videos_pro_monat: 12 }, name)
    expect(t).toContain('Bella')
    expect(t).toContain('1200 €')
    expect(t).toContain('12 Videos')
  })

  it('nennt Rhythmus, Starttag und ausgelassene Tage', () => {
    const t = beschreibe({ art: 'monatsplan', client_id: 'a', monat: '2026-10', anzahl: 12, abstand: 2, start_tag: 3, auslassen: [17] }, name)
    expect(t).toContain('12 Videos')
    expect(t).toContain('alle 2 Tage')
    expect(t).toContain('ab dem 3.')
    expect(t).toContain('17')
  })

  it('schreibt Datumsangaben deutsch', () => {
    const t = beschreibe({ art: 'video_anlegen', client_id: 'a', titel: 'Reel', datum: '2026-10-07' }, name)
    expect(t).toContain('7.10.')
  })

  it('macht aus einem ganztaegigen Termin auch einen ganztaegigen Satz', () => {
    const t = beschreibe({ art: 'termin_anlegen', titel: 'Urlaub', kind: 'termin', von: '2026-10-12', bis: '2026-10-16' }, name)
    expect(t).toContain('12.10.')
    expect(t).toContain('16.10.')
    expect(t).toContain('ganztägig')
  })

  it('nennt die Uhrzeit, wenn es eine gibt', () => {
    const t = beschreibe({ art: 'termin_anlegen', titel: 'Schicht', kind: 'arbeit', von: '2026-10-09', ab: '16:00', bis_zeit: '22:00' }, name)
    expect(t).toContain('16:00')
    expect(t).toContain('22:00')
  })

  it('sagt beim Absagen, dass es ums Absagen geht', () => {
    const t = beschreibe({ art: 'video_absagen', client_id: 'a', datum: '2026-10-17' }, name)
    expect(t).toContain('absagen')
    expect(t).toContain('17.10.')
  })
})

describe('Leads — mehrere in einem Auftrag', () => {
  it('laesst drei Leads mit verschiedenen Staenden durch', () => {
    const plan: Schritt[] = [
      { art: 'lead_anlegen', name: 'Café Nord', stand: 'contacted', stadt: 'Münster' },
      { art: 'lead_anlegen', name: 'Burger Base', stand: 'talking', potenzial: 800 },
      { art: 'lead_anlegen', name: 'Eisdiele Luna', stand: 'offer' },
    ]
    expect(pruefe(plan)).toEqual([])
  })

  it('beanstandet einen Lead ohne Namen', () => {
    expect(pruefe([{ art: 'lead_anlegen', name: '' }])[0]).toMatch(/keinen Namen/)
  })

  it('beanstandet einen erfundenen Stand', () => {
    expect(pruefe([{ art: 'lead_anlegen', name: 'X', stand: 'vielleicht' }])[0]).toMatch(/kein bekannter Stand/)
  })

  it('beanstandet ein Lead-Aendern ohne Lead', () => {
    expect(pruefe([{ art: 'lead_aendern', stand: 'won' }])[0]).toMatch(/Kein Lead/)
  })

  it('erlaubt Anlegen und direktes Aendern ueber einen Platzhalter', () => {
    const plan: Schritt[] = [
      { art: 'lead_anlegen', ref: 'l1', name: 'Neu' },
      { art: 'lead_aendern', lead_ref: 'l1', stand: 'talking' },
    ]
    expect(pruefe(plan)).toEqual([])
  })

  it('beschreibt Stand, Stadt und Potenzial im Klartext', () => {
    const t = beschreibe({ art: 'lead_anlegen', name: 'Burger Base', stand: 'talking', stadt: 'Münster', potenzial: 800 }, name)
    expect(t).toContain('Burger Base')
    expect(t).toContain('Im Gespräch')
    expect(t).toContain('Münster')
    expect(t).toContain('800 €')
  })
})

describe('Profilbild', () => {
  it('laesst einen sauberen Abruf durch', () => {
    const plan: Schritt[] = [
      { art: 'kunde_anlegen', ref: 'k1', name: 'Bella', instagram: 'bella' },
      { art: 'profilbild_holen', client_ref: 'k1', plattform: 'instagram', handle: 'bella' },
    ]
    expect(pruefe(plan)).toEqual([])
  })

  it('beanstandet eine unbekannte Plattform', () => {
    const plan: Schritt[] = [{ art: 'profilbild_holen', client_id: 'a', plattform: 'facebook', handle: 'x' }]
    expect(pruefe(plan)[0]).toMatch(/kenne ich nicht/)
  })

  it('beanstandet ein fehlendes Handle', () => {
    const plan: Schritt[] = [{ art: 'profilbild_holen', client_id: 'a', plattform: 'tiktok', handle: ' ' }]
    expect(pruefe(plan)[0]).toMatch(/Kein Handle/)
  })

  it('sagt in der Vorschau, woher das Bild kommt', () => {
    const t = beschreibe({ art: 'profilbild_holen', client_id: 'a', plattform: 'tiktok', handle: '@bella' }, name)
    expect(t).toContain('TikTok')
    expect(t).toContain('@bella')
  })
})
