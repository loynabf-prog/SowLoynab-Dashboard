import { describe, it, expect } from 'vitest'
import { normalizeItems, itemsNet, type InvoiceData } from '../invoicePdf'

const base: InvoiceData = {
  number: '2026-001', amount: 0, issued_on: '2026-08-01', due_date: null,
}

describe('itemsNet', () => {
  it('summiert Menge × Einzelpreis', () => {
    expect(itemsNet([{ desc: 'A', qty: 2, price: 100 }, { desc: 'B', qty: 1, price: 50 }])).toBe(250)
  })
  it('behandelt fehlende Werte als 0', () => {
    expect(itemsNet([{ desc: 'x', qty: NaN as any, price: 10 }])).toBe(0)
    expect(itemsNet([])).toBe(0)
  })
})

describe('normalizeItems', () => {
  it('nutzt echte Positionen, wenn vorhanden', () => {
    const inv = { ...base, items: [{ desc: 'Reels', qty: 8, price: 60 }] }
    const items = normalizeItems(inv)
    expect(items).toHaveLength(1)
    expect(itemsNet(items)).toBe(480)
  })
  it('fällt auf notes + amount zurück, wenn keine Positionen', () => {
    const inv = { ...base, amount: 500, notes: 'Betreuung' }
    const items = normalizeItems(inv)
    expect(items).toEqual([{ desc: 'Betreuung', qty: 1, price: 500 }])
  })
  it('liefert eine Standardzeile, wenn gar nichts da ist', () => {
    const items = normalizeItems({ ...base, amount: 0 })
    expect(items).toHaveLength(1)
    expect(items[0].qty).toBe(1)
  })
  it('ignoriert leere Positionen', () => {
    const inv = { ...base, items: [{ desc: '', qty: 1, price: 0 }, { desc: 'Echt', qty: 1, price: 90 }] }
    expect(itemsNet(normalizeItems(inv))).toBe(90)
  })
})

describe('USt-Rechnung', () => {
  it('19% USt korrekt', () => {
    const net = itemsNet([{ desc: 'x', qty: 1, price: 1000 }])
    const gross = net * (1 + 19 / 100)
    expect(gross).toBeCloseTo(1190, 2)
  })
  it('Kleinunternehmer (0%) = netto', () => {
    const net = itemsNet([{ desc: 'x', qty: 3, price: 200 }])
    expect(net * (1 + 0 / 100)).toBe(600)
  })
})
