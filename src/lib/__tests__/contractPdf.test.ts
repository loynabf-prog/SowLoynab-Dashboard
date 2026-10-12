import { describe, it, expect } from 'vitest'
import { buildContract, FRIST_MONATLICH, type ContractVars } from '../contract'
import { contractPdf, contractFilename } from '../contractPdf'

const v: ContractVars = {
  agentur: { name: 'Sow & Loynab Media GbR', vertreten: 'Fassie', adresse: 'Musterweg 1, 48143 Münster' },
  kunde: { name: 'Pizzeria Bella', vertreten: 'Chef', adresse: 'Hauptstr. 2, 48143 Münster' },
  konditionen: { videos: 12, netto: 1000, ust: 19, rechnung: { name: null, adresse: null, email: 'rechnung@test.de' } },
  stundensatz: 90,
  kuendigungsfrist: FRIST_MONATLICH,
  gerichtsstand: 'Münster',
  reisekostenOrt: 'Münster',
  korrekturschleifen: 2,
  beginn: '2026-11-01',
}

describe('contractPdf', () => {
  it('erzeugt ein mehrseitiges PDF mit Unterschriftsnachweis', () => {
    const doc = contractPdf(buildContract(v), {
      signed_at: '2026-10-11T12:00:00Z', signer_name: 'Chef', client_name: 'Pizzeria Bella',
    })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000)
  })
  it('kommt auch mit einem halbfertigen Entwurf klar', () => {
    const doc = contractPdf(buildContract({
      ...v,
      konditionen: { videos: null, netto: null, ust: null, rechnung: { name: null, adresse: null, email: null } },
      beginn: null,
    }))
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })
  it('nimmt eine gezeichnete Unterschrift mit ins PDF', () => {
    // Ein echtes 1x1-PNG -- jsPDF muss es einbetten koennen, nicht nur schlucken
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const ohne = contractPdf(buildContract(v), {
      signed_at: '2026-10-11T12:00:00Z', signer_name: 'Chef',
    }).output('arraybuffer').byteLength
    const mit = contractPdf(buildContract(v), {
      signed_at: '2026-10-11T12:00:00Z', signer_name: 'Chef', signer_signature: png,
    }).output('arraybuffer').byteLength
    expect(mit).toBeGreaterThan(ohne)
  })
  it('bricht nicht ab, wenn die Unterschrift Unsinn ist', () => {
    expect(() => contractPdf(buildContract(v), {
      signed_at: '2026-10-11T12:00:00Z', signer_name: 'Chef', signer_signature: 'kaputt',
    })).not.toThrow()
  })
  it('benennt die Datei nach Kunde und Stand', () => {
    const b = buildContract(v)
    expect(contractFilename(b, true)).toBe('Rahmenvertrag-Pizzeria-Bella-unterschrieben.pdf')
    expect(contractFilename(b, false)).toBe('Rahmenvertrag-Pizzeria-Bella.pdf')
  })
})
