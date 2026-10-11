import { describe, it, expect } from 'vitest'
import {
  betrag, bruttoVon, buildContract, fehlendeAngaben, konditionenVon, rechnungZeile,
  ustAus, vertragKomplett, FRIST_MONATLICH, type ContractVars,
} from '../contract'

const vars = (over: Partial<ContractVars> = {}): ContractVars => ({
  agentur: { name: 'Sow & Loynab Media GbR', vertreten: 'Fassie', adresse: 'Musterweg 1, 48143 Münster' },
  kunde: { name: 'Testgastro', vertreten: 'Chef', adresse: 'Hauptstr. 2, 48143 Münster' },
  konditionen: {
    videos: 12,
    netto: 1000,
    ust: 19,
    rechnung: { name: null, adresse: 'Hauptstr. 2, 48143 Münster', email: 'rechnung@test.de' },
  },
  stundensatz: 90,
  kuendigungsfrist: FRIST_MONATLICH,
  gerichtsstand: 'Münster',
  reisekostenOrt: 'Münster',
  korrekturschleifen: 2,
  beginn: '2026-11-01',
  ...over,
})

describe('betrag', () => {
  it('zeigt immer zwei Stellen', () => {
    expect(betrag(1190)).toBe('1.190,00 €')
    expect(betrag(0)).toBe('0,00 €')
  })
  it('setzt einen Platzhalter, solange nichts eingetragen ist', () => {
    expect(betrag(null)).toBe('[Betrag]')
  })
})

describe('bruttoVon', () => {
  it('rechnet die Umsatzsteuer drauf', () => {
    expect(bruttoVon(1000, 19)).toBe(1190)
    expect(bruttoVon(1000, 7)).toBe(1070)
  })
  it('rundet auf Cent', () => {
    expect(bruttoVon(333.33, 19)).toBe(396.66)
  })
  it('laesst Kleinunternehmer unberuehrt', () => {
    expect(bruttoVon(1000, 0)).toBe(1000)
  })
  it('bleibt leer, solange eine Zahl fehlt', () => {
    expect(bruttoVon(null, 19)).toBeNull()
    expect(bruttoVon(1000, null)).toBeNull()
  })
})

describe('fehlendeAngaben', () => {
  it('meldet nichts, wenn alles da ist', () => {
    expect(fehlendeAngaben(vars())).toEqual([])
    expect(vertragKomplett(vars())).toBe(true)
  })
  it('nennt jede Luecke einzeln', () => {
    const offen = fehlendeAngaben(vars({
      kunde: { name: 'Testgastro', vertreten: 'Chef', adresse: null },
      konditionen: { videos: null, netto: null, ust: null, rechnung: { name: null, adresse: null, email: null } },
      beginn: null,
    }))
    expect(offen).toContain('Videoanzahl')
    expect(offen).toContain('Nettobetrag')
    expect(offen).toContain('Umsatzsteuer')
    expect(offen).toContain('Rechnungsanschrift')
    expect(offen).toContain('Beginn')
    expect(vertragKomplett(vars({ beginn: null }))).toBe(false)
  })
  it('nimmt die Kundenanschrift als Rechnungsanschrift, wenn keine eigene da ist', () => {
    const k = vars().konditionen
    expect(fehlendeAngaben(vars({ konditionen: { ...k, rechnung: { name: null, adresse: null, email: null } } })))
      .toEqual([])
  })
  it('wertet 0 % Umsatzsteuer als Angabe, nicht als Luecke', () => {
    const k = vars().konditionen
    expect(fehlendeAngaben(vars({ konditionen: { ...k, ust: 0 } }))).toEqual([])
  })
  it('verlangt die Namen beider Seiten', () => {
    expect(fehlendeAngaben(vars({ agentur: { name: 'A', vertreten: null } })))
      .toContain('Vertreter der Agentur')
    expect(fehlendeAngaben(vars({ kunde: { name: 'Testgastro', vertreten: '  ' } })))
      .toContain('Ansprechpartner beim Kunden')
  })
})

describe('buildContract', () => {
  it('schreibt Videoanzahl, Netto und Brutto in den Vertragstext', () => {
    const b = buildContract(vars())
    const p2 = b.paragraphen.find((p) => p.titel.startsWith('§ 2'))!
    expect(p2.absaetze[0]).toContain('12 Videos je Kalendermonat')
    expect(p2.absaetze[1]).toContain('1.000,00 € netto')
    expect(p2.absaetze[1]).toContain('19 %')
    expect(p2.absaetze[1]).toContain('1.190,00 € brutto')
  })
  it('rechnet das Brutto mit in den Vertrag', () => {
    expect(buildContract(vars()).konditionen.brutto).toBe(1190)
  })
  it('formuliert Kleinunternehmer ohne Umsatzsteuer', () => {
    const k = vars().konditionen
    const b = buildContract(vars({ konditionen: { ...k, ust: 0 } }))
    const p2 = b.paragraphen.find((p) => p.titel.startsWith('§ 2'))!
    expect(p2.absaetze[1]).toContain('§ 19 UStG')
    expect(p2.absaetze[1]).not.toContain('brutto')
    expect(b.konditionen.brutto).toBe(1000)
  })
  it('nennt die Rechnungsanschrift, damit die Rechnung hingehen kann', () => {
    const b = buildContract(vars())
    const p2 = b.paragraphen.find((p) => p.titel.startsWith('§ 2'))!
    expect(p2.absaetze[3]).toContain('Hauptstr. 2, 48143 Münster')
    expect(p2.absaetze[3]).toContain('rechnung@test.de')
  })
  it('nimmt einen abweichenden Rechnungsempfaenger', () => {
    const k = vars().konditionen
    const b = buildContract(vars({
      konditionen: { ...k, rechnung: { name: 'Gastro Holding GmbH', adresse: 'Am Hafen 9, 48155 Münster', email: null } },
    }))
    expect(rechnungZeile(b)).toBe('Gastro Holding GmbH, Am Hafen 9, 48155 Münster')
  })
  it('faellt beim Rechnungsempfaenger auf den Kunden zurueck', () => {
    const k = vars().konditionen
    const b = buildContract(vars({ konditionen: { ...k, rechnung: { name: null, adresse: null, email: null } } }))
    expect(rechnungZeile(b)).toBe('Testgastro, Hauptstr. 2, 48143 Münster')
  })
  it('haelt den Vertrag monatlich kuendbar und ohne Mindestlaufzeit', () => {
    const p = buildContract(vars()).paragraphen.find((x) => x.titel.includes('Laufzeit'))!
    expect(p.absaetze[1]).toContain('Eine Mindestlaufzeit besteht nicht')
    expect(p.absaetze[1]).toContain('monatlich kündbar')
  })
  it('setzt Platzhalter statt falscher Zahlen, solange etwas fehlt', () => {
    const b = buildContract(vars({
      kunde: { name: 'Testgastro', vertreten: 'Chef', adresse: null },
      konditionen: { videos: null, netto: null, ust: null, rechnung: { name: null, adresse: null, email: null } },
      beginn: null,
    }))
    const p2 = b.paragraphen.find((p) => p.titel.startsWith('§ 2'))!
    expect(p2.absaetze[0]).toContain('[Anzahl]')
    expect(p2.absaetze[1]).toContain('[Betrag]')
    expect(p2.absaetze[3]).toContain('[Rechnungsanschrift]')
  })
  it('numeriert die Paragraphen fortlaufend ohne Luecke', () => {
    const nr = buildContract(vars()).paragraphen.map((p) => Number(p.titel.match(/§ (\d+)/)![1]))
    expect(nr).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })
  it('singular bei einem Video', () => {
    const k = vars().konditionen
    const b = buildContract(vars({ konditionen: { ...k, videos: 1 } }))
    expect(b.paragraphen[1].absaetze[0]).toContain('1 Video je Kalendermonat')
  })
})

describe('konditionenVon', () => {
  it('kommt mit alten Vertraegen ohne Konditionen klar', () => {
    const alt = { titel: 'x', paragraphen: [] } as unknown as Parameters<typeof konditionenVon>[0]
    expect(konditionenVon(alt)).toEqual({
      videos: null, netto: null, ust: null, brutto: null,
      rechnung: { name: null, adresse: null, email: null },
    })
  })
  it('gibt bei null einen leeren Block zurueck', () => {
    expect(konditionenVon(null).videos).toBeNull()
  })
})

describe('ustAus', () => {
  it('nimmt 0 % fuer Kleinunternehmer', () => {
    expect(ustAus({ kleinunternehmer: true, defaultVat: 19 })).toBe(0)
  })
  it('nimmt sonst den hinterlegten Satz', () => {
    expect(ustAus({ defaultVat: 7 })).toBe(7)
    expect(ustAus({})).toBe(19)
  })
})
