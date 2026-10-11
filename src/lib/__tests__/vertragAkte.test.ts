import { describe, it, expect } from 'vitest'
import { archivPfad, mailVorlage, nachricht, waNummer, whatsappLink } from '../vertragAkte'

describe('archivPfad', () => {
  it('legt je Vertrag genau eine Datei ab', () => {
    expect(archivPfad('kunde-1', 'vertrag-9')).toBe('kunde-1/vertrag-9.pdf')
  })
})

describe('waNummer', () => {
  it('macht aus einer deutschen Nummer das Format fuer WhatsApp', () => {
    expect(waNummer('0151 23456789')).toBe('4915123456789')
    expect(waNummer('+49 151 23456789')).toBe('4915123456789')
    expect(waNummer('0049-151-23456789')).toBe('4915123456789')
  })
  it('laesst eine bereits saubere Nummer in Ruhe', () => {
    expect(waNummer('4915123456789')).toBe('4915123456789')
  })
  it('verwirft, was keine Nummer ist', () => {
    expect(waNummer(null)).toBeNull()
    expect(waNummer('')).toBeNull()
    expect(waNummer('12345')).toBeNull()
  })
})

describe('whatsappLink', () => {
  it('geht mit Nummer direkt in den Chat', () => {
    expect(whatsappLink('Hallo', '0151 23456789')).toBe('https://wa.me/4915123456789?text=Hallo')
  })
  it('oeffnet ohne Nummer die Kontaktauswahl', () => {
    expect(whatsappLink('Hallo')).toBe('https://wa.me/?text=Hallo')
  })
  it('kodiert den Text, damit der Link nicht abbricht', () => {
    expect(whatsappLink('a b&c')).toContain('a%20b%26c')
  })
})

describe('nachricht', () => {
  it('nennt Kunde und Link', () => {
    const t = nachricht('Testgastro', 'https://app.sowloynab.de/vertrag/abc')
    expect(t).toContain('Testgastro')
    expect(t).toContain('https://app.sowloynab.de/vertrag/abc')
  })
})

describe('mailVorlage', () => {
  it('hat Kundennamen im Betreff und Link im Text', () => {
    const m = mailVorlage('Testgastro', 'https://app.sowloynab.de/vertrag/abc')
    expect(m.subject).toContain('Testgastro')
    expect(m.html).toContain('https://app.sowloynab.de/vertrag/abc')
  })
})
