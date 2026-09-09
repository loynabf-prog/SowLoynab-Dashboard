import { jsPDF } from 'jspdf'
import type { ContractBody } from './contract'

export interface SignInfo {
  signed_at?: string | null
  signer_name?: string | null
  signer_role?: string | null
  client_name?: string
}

const L = 20, R = 190, BREITE = R - L

// Vertrag als PDF. Ist er unterschrieben, steht der Nachweis mit Name und
// Zeitpunkt unten drunter — das ist der Beleg, den beide Seiten aufbewahren.
export function contractPdf(body: ContractBody, sign: SignInfo = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 24

  const platz = (h: number) => {
    if (y + h > 275) { doc.addPage(); y = 24 }
  }
  const absatz = (text: string, opt: { groesse?: number; fett?: boolean; grau?: boolean; nach?: number } = {}) => {
    doc.setFontSize(opt.groesse ?? 9.5)
    doc.setFont('helvetica', opt.fett ? 'bold' : 'normal')
    doc.setTextColor(opt.grau ? 120 : 30)
    const zeilen = doc.splitTextToSize(text, BREITE)
    platz(zeilen.length * 4.6)
    doc.text(zeilen, L, y)
    y += zeilen.length * 4.6 + (opt.nach ?? 2)
  }

  // --- Kopf ---
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(20)
  doc.text(body.titel, L, y); y += 10

  const partei = (p: { name: string; vertreten?: string | null; adresse?: string | null }, rolle: string) => {
    const teile = [p.name, p.vertreten ? `vertreten durch ${p.vertreten}` : null, p.adresse].filter(Boolean)
    absatz(teile.join(', '), { fett: true, nach: 0 })
    absatz(rolle, { grau: true, groesse: 8.5, nach: 4 })
  }
  absatz('zwischen', { grau: true, nach: 1 })
  partei(body.agentur, '— nachfolgend „Agentur" —')
  absatz('und', { grau: true, nach: 1 })
  partei(body.kunde, '— nachfolgend „Kunde" —')

  doc.setDrawColor(200); doc.line(L, y, R, y); y += 6

  // --- Paragraphen ---
  for (const p of body.paragraphen) {
    platz(14)
    absatz(p.titel, { fett: true, groesse: 10.5, nach: 1.5 })
    p.absaetze.forEach((a, i) => absatz(`(${i + 1})  ${a}`, { nach: 2 }))
    y += 2
  }

  // --- Unterschriften ---
  y += 6
  platz(40)
  doc.setDrawColor(200); doc.line(L, y, R, y); y += 8

  if (sign.signed_at) {
    const wann = new Date(sign.signed_at).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    absatz('Elektronisch geschlossen', { fett: true, groesse: 10, nach: 1.5 })
    absatz(
      `Der Kunde hat diesen Vertrag am ${wann} Uhr über den ihm zugesandten Link bestätigt.`,
      { nach: 1 },
    )
    absatz(
      `Bestätigt durch: ${sign.signer_name ?? '—'}${sign.signer_role ? `, ${sign.signer_role}` : ''}` +
      `${sign.client_name ? ` (${sign.client_name})` : ''}`,
      { fett: true, nach: 3 },
    )
    absatz(
      'Dieser Nachweis dokumentiert den Wortlaut des Vertrags zum Zeitpunkt der Bestätigung.',
      { grau: true, groesse: 8, nach: 0 },
    )
  } else {
    const mitte = L + BREITE / 2
    doc.setDrawColor(60)
    doc.line(L, y + 14, mitte - 8, y + 14)
    doc.line(mitte + 8, y + 14, R, y + 14)
    doc.setFontSize(8); doc.setTextColor(120); doc.setFont('helvetica', 'normal')
    doc.text('Ort, Datum — Agentur', L, y + 18)
    doc.text('Ort, Datum — Kunde', mitte + 8, y + 18)
  }

  // --- Fußzeile mit Seitenzahlen ---
  const seiten = doc.getNumberOfPages()
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setTextColor(150); doc.setFont('helvetica', 'normal')
    doc.text(`${body.titel} · ${body.kunde.name}`, L, 288)
    doc.text(`Seite ${i} von ${seiten}`, R, 288, { align: 'right' })
  }
  return doc
}

export function contractFilename(body: ContractBody, signed: boolean): string {
  const safe = (s: string) => s.replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '-')
  return `Rahmenvertrag-${safe(body.kunde.name)}${signed ? '-unterschrieben' : ''}.pdf`
}
