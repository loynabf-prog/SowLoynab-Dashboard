import { jsPDF } from 'jspdf'
import type { Company } from './settings'

export interface InvoiceItem {
  desc: string
  qty: number
  price: number   // Einzelpreis netto
}

export interface InvoiceData {
  number: string | null
  amount: number            // Netto-Gesamt (Summe der Positionen)
  vat_rate?: number | null  // 0 = Kleinunternehmer
  issued_on: string
  due_date: string | null
  service_period?: string | null
  notes?: string | null     // Leistungsbeschreibung (Fallback bei einer Position)
  recipient?: string | null // mehrzeilige Empfängeradresse
  items?: InvoiceItem[] | null
  client_name?: string
}

// Positionen normalisieren: echte items oder Fallback aus notes+amount
export function normalizeItems(inv: InvoiceData): InvoiceItem[] {
  const items = (inv.items ?? []).filter((it) => it && (it.desc || it.price))
  if (items.length) return items.map((it) => ({ desc: it.desc || 'Leistung', qty: Number(it.qty) || 1, price: Number(it.price) || 0 }))
  return [{ desc: inv.notes || 'Social-Media-Betreuung', qty: 1, price: Number(inv.amount) || 0 }]
}

export function itemsNet(items: InvoiceItem[]): number {
  return items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)
}

const euro = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('de-DE') : '—')

export function buildInvoicePdf(inv: InvoiceData, co: Company): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 20, R = 190
  const brand = [224, 82, 26] as const
  const ink = [33, 27, 20] as const
  const dim = [120, 110, 95] as const

  // --- Absender-Kopf ---
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ink)
  doc.text(co.name || 'Sow & Loynab Media', L, 22)
  doc.setDrawColor(...brand); doc.setLineWidth(0.8); doc.line(L, 25, R, 25)

  // Absender-Zeile klein (für das Adressfenster)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...dim)
  const senderLine = [co.name, (co.address || '').replace(/\n/g, ', ')].filter(Boolean).join(' · ')
  doc.text(senderLine, L, 40)

  // --- Empfänger ---
  doc.setFontSize(10.5); doc.setTextColor(...ink)
  const rec = (inv.recipient || inv.client_name || '').split('\n')
  doc.text(rec, L, 48)

  // --- Meta rechts ---
  doc.setFontSize(9.5)
  const metaY = 44
  const meta: [string, string][] = [
    ['Rechnungs-Nr.', inv.number || '—'],
    ['Datum', d(inv.issued_on)],
    ...(inv.service_period ? [['Leistung', inv.service_period]] as [string, string][] : []),
    ...(inv.due_date ? [['Fällig bis', d(inv.due_date)]] as [string, string][] : []),
  ]
  meta.forEach((row, i) => {
    doc.setTextColor(...dim); doc.text(row[0], 130, metaY + i * 6)
    doc.setTextColor(...ink); doc.text(row[1], R, metaY + i * 6, { align: 'right' })
  })

  // --- Titel ---
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...ink)
  doc.text(`Rechnung ${inv.number || ''}`.trim(), L, 82)

  // --- Positions-Kopf ---
  const items = normalizeItems(inv)
  const multi = items.length > 1 || items.some((it) => (Number(it.qty) || 1) !== 1)
  const colMenge = 120, colEinzel = 148 // Spalten-x nur bei mehreren Positionen
  let y = 94
  doc.setFillColor(247, 242, 234); doc.rect(L, y - 6, R - L, 9, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ink)
  doc.text('Beschreibung', L + 2, y)
  if (multi) {
    doc.text('Menge', colMenge, y, { align: 'right' })
    doc.text('Einzel', colEinzel + 8, y, { align: 'right' })
  }
  doc.text('Betrag', R - 2, y, { align: 'right' })
  y += 9

  // --- Positionen ---
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...ink)
  for (const it of items) {
    const lineTotal = (Number(it.qty) || 1) * (Number(it.price) || 0)
    const descLines = doc.splitTextToSize(it.desc || 'Leistung', multi ? 96 : 120)
    doc.text(descLines, L + 2, y)
    if (multi) {
      doc.text(String(Number(it.qty) || 1), colMenge, y, { align: 'right' })
      doc.text(euro(Number(it.price) || 0), colEinzel + 8, y, { align: 'right' })
    }
    doc.text(euro(lineTotal), R - 2, y, { align: 'right' })
    y += Math.max(descLines.length * 5, 6) + 3
    if (y > 250) break // Sicherheits-Stopp (eine Seite)
  }
  y += 1
  doc.setDrawColor(230, 224, 214); doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 8

  // --- Summen ---
  const vatRate = inv.vat_rate ?? 0
  const net = itemsNet(items)
  const vat = net * vatRate / 100
  const gross = net + vat
  const sumX = 130
  doc.setFontSize(10)
  function sumLine(label: string, val: string, bold = false) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lc = bold ? ink : dim
    doc.setTextColor(lc[0], lc[1], lc[2]); doc.text(label, sumX, y)
    doc.setTextColor(...ink); doc.text(val, R, y, { align: 'right' }); y += 6
  }
  if (vatRate > 0) {
    sumLine('Nettobetrag', euro(net))
    sumLine(`zzgl. ${vatRate}% USt`, euro(vat))
    y += 1; doc.setDrawColor(...brand); doc.setLineWidth(0.5); doc.line(sumX, y - 3, R, y - 3)
    sumLine('Gesamtbetrag', euro(gross), true)
  } else {
    sumLine('Gesamtbetrag', euro(gross), true)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...dim)
    doc.text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', L, y + 4)
    y += 8
  }

  // --- Zahlungshinweis ---
  y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...ink)
  const pay = `Bitte überweisen Sie den Betrag${inv.due_date ? ` bis zum ${d(inv.due_date)}` : ''} auf folgendes Konto:`
  doc.text(pay, L, y); y += 6
  doc.setTextColor(...dim); doc.setFontSize(9)
  const bank = [
    co.bank && `Bank: ${co.bank}`,
    co.iban && `IBAN: ${co.iban}`,
    co.bic && `BIC: ${co.bic}`,
  ].filter(Boolean) as string[]
  bank.forEach((b) => { doc.text(b, L, y); y += 5 })

  // --- Fußzeile ---
  const footY = 282
  doc.setDrawColor(230, 224, 214); doc.setLineWidth(0.3); doc.line(L, footY - 5, R, footY - 5)
  doc.setFontSize(7.5); doc.setTextColor(...dim)
  const foot = [
    [co.name, co.address?.replace(/\n/g, ', ')].filter(Boolean).join(' · '),
    [co.phone && `Tel: ${co.phone}`, co.email && `${co.email}`].filter(Boolean).join(' · '),
    [co.taxId && `Steuer-Nr: ${co.taxId}`, co.vatId && `USt-IdNr: ${co.vatId}`].filter(Boolean).join(' · '),
    co.footer || '',
  ].filter(Boolean)
  foot.forEach((line, i) => doc.text(String(line), 105, footY + i * 3.6, { align: 'center' }))

  return doc
}

// PDF als Blob + Dateiname (zum Verschicken als Anhang)
export function invoicePdfBlob(inv: InvoiceData, co: Company): { blob: Blob; filename: string } {
  const doc = buildInvoicePdf(inv, co)
  const filename = `Rechnung_${(inv.number || 'ohne-nr').replace(/[^\w-]/g, '_')}.pdf`
  return { blob: doc.output('blob'), filename }
}

// PDF am iPhone teilen (Share-Sheet) oder am Mac herunterladen
export async function exportInvoicePdf(inv: InvoiceData, co: Company) {
  const doc = buildInvoicePdf(inv, co)
  const filename = `Rechnung_${(inv.number || 'ohne-nr').replace(/[^\w-]/g, '_')}.pdf`
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })
  const nav = navigator as any
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title: filename }); return } catch { /* abgebrochen -> Download */ }
  }
  doc.save(filename)
}
