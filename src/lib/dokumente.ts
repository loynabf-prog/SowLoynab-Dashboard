// Agentur-Dokumente (Migration 0070): Gewerbeanmeldung, Steuer, Vertraege,
// Versicherung ... als Datei im CRM. Die Datei liegt im privaten Bucket
// "dokumente"; geoeffnet wird ueber eine kurzlebige signierte Adresse.

import { supabase } from './supabase'
import { rufeFunktion } from './funktion'

export const DOK_BUCKET = 'dokumente'

export type DokKategorie = 'behoerde' | 'steuer' | 'vertrag' | 'versicherung' | 'bank' | 'rechnung' | 'vorlage' | 'privat' | 'sonstiges'

export const KATEGORIEN: { key: DokKategorie; label: string; hinweis: string }[] = [
  { key: 'behoerde', label: 'Behörde', hinweis: 'Gewerbeanmeldung, Handelsregister, Bescheide' },
  { key: 'steuer', label: 'Steuer', hinweis: 'Steuernummer, USt-ID, Bescheide, Steuerberater' },
  { key: 'vertrag', label: 'Verträge', hinweis: 'GbR-Vertrag, Mietvertrag, Abos' },
  { key: 'versicherung', label: 'Versicherung', hinweis: 'Policen, Haftpflicht' },
  { key: 'bank', label: 'Bank', hinweis: 'Kontoeröffnung, Vollmachten' },
  { key: 'rechnung', label: 'Rechnungen', hinweis: 'Rechnungen, Quittungen, Belege – landen auch im Dropbox-Buchhaltungseingang' },
  { key: 'vorlage', label: 'Vorlagen', hinweis: 'Angebote, Rechnungsvorlage, Briefpapier' },
  { key: 'privat', label: 'Privat', hinweis: 'Private Post von Fassie oder Lion' },
  { key: 'sonstiges', label: 'Sonstiges', hinweis: 'Alles andere' },
]

export interface Dokument {
  id: string
  titel: string
  kategorie: DokKategorie
  dateiname: string
  pfad: string
  mime: string | null
  groesse: number | null
  notiz: string | null
  gueltig_bis: string | null
  created_at: string
  inhalt?: string | null
  absender?: string | null
  dokument_datum?: string | null
  frist?: string | null
  handlung?: string | null
  betrifft?: 'agentur' | 'fassie' | 'lion' | null
  erkennung?: 'laeuft' | 'fertig' | 'fehler' | null
  aufgabe_id?: string | null
  dropbox_pfad?: string | null
}

export async function ladeDokumente(): Promise<Dokument[]> {
  const { data, error } = await supabase.from('dokumente').select('*').is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Dokument[]
}

function sichererName(n: string): string {
  return n.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'datei'
}

/** Datei hochladen und Zeile anlegen. */
export async function hochladen(opts: { file: File; titel: string; kategorie: DokKategorie; notiz?: string; gueltigBis?: string | null; userId?: string | null; erkennen?: boolean }): Promise<Dokument> {
  const { file } = opts
  const pfad = `${opts.kategorie}/${Date.now()}-${sichererName(file.name)}`
  const { error } = await supabase.storage.from(DOK_BUCKET).upload(pfad, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  const { data, error: e2 } = await supabase.from('dokumente').insert({
    titel: opts.titel.trim() || file.name, kategorie: opts.kategorie, dateiname: file.name, pfad,
    mime: file.type || null, groesse: file.size, notiz: opts.notiz?.trim() || null, gueltig_bis: opts.gueltigBis || null,
    created_by: opts.userId ?? null, erkennung: opts.erkennen ? 'laeuft' : 'fertig',
  }).select('*').single()
  if (e2) throw e2
  return data as Dokument
}

export async function aendern(id: string, patch: Partial<Pick<Dokument, 'titel' | 'kategorie' | 'notiz' | 'gueltig_bis' | 'betrifft'>>): Promise<void> {
  const { error } = await supabase.from('dokumente').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/** Kurzlebige Adresse zum Oeffnen/Teilen (10 Minuten). */
export async function oeffnenUrl(d: Dokument): Promise<string> {
  const { data, error } = await supabase.storage.from(DOK_BUCKET).createSignedUrl(d.pfad, 600)
  if (error || !data?.signedUrl) throw error ?? new Error('Keine Adresse')
  return data.signedUrl
}

/** Weg damit: Zeile als geloescht markieren, Datei entfernen. */
export async function loeschen(d: Dokument): Promise<void> {
  const { error } = await supabase.from('dokumente').update({ deleted_at: new Date().toISOString() }).eq('id', d.id)
  if (error) throw error
  await supabase.storage.from(DOK_BUCKET).remove([d.pfad])
}

export function groesseText(b: number | null): string {
  if (!b) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Titel-Vorschlag aus dem Dateinamen: "gewerbeanmeldung_2026.pdf" -> "Gewerbeanmeldung 2026". */
export function titelAus(dateiname: string): string {
  const ohne = dateiname.replace(/\.[A-Za-z0-9]+$/, '').replace(/[_\-.]+/g, ' ').trim()
  return ohne ? ohne[0].toUpperCase() + ohne.slice(1) : ''
}

/** Kategorie raten: steht im Dateinamen ein Stichwort? */
export function kategorieRaten(name: string): DokKategorie {
  const n = name.toLowerCase()
  if (/gewerbe|handelsregister|amt|bescheid|anmeldung/.test(n)) return 'behoerde'
  if (/steuer|ust|finanzamt|elster/.test(n)) return 'steuer'
  if (/vertrag|gbr|miet|abo/.test(n)) return 'vertrag'
  if (/versicher|police|haftpflicht/.test(n)) return 'versicherung'
  if (/bank|konto|iban|fyrst/.test(n)) return 'bank'
  if (/rechnung|quittung|beleg|invoice|receipt/.test(n)) return 'rechnung'
  if (/vorlage|template|angebot|briefpapier/.test(n)) return 'vorlage'
  return 'sonstiges'
}

// ---- Scannen + automatisch erkennen (Migration 0075) -----------------------

export interface ErkennungsErgebnis {
  titel: string; kategorie: DokKategorie; betrifft: string
  frist: string | null; handlung: string | null
  aufgabe: { id: string; due_date: string } | null
  dropbox: string | null
}

/** Claude liest die Datei, benennt und sortiert sie ein (Edge Function dokument-erkennen). */
export async function erkennen(id: string): Promise<ErkennungsErgebnis> {
  return rufeFunktion<ErkennungsErgebnis>('dokument-erkennen', { id })
}

/** Hochladen und direkt von Claude erkennen lassen. Titel ist vorlaeufig der Dateiname. */
export async function ablegenUndErkennen(file: File, userId?: string | null): Promise<{ dok: Dokument; ergebnis: ErkennungsErgebnis | null; fehler: string | null }> {
  const dok = await hochladen({ file, titel: titelAus(file.name) || file.name, kategorie: 'sonstiges', userId, erkennen: kannErkennen(file.type) })
  if (!kannErkennen(file.type)) return { dok, ergebnis: null, fehler: 'kann ich hier nicht lesen – schick die Datei Claude in den Chat, dann wird sie dort eingepflegt' }
  try { return { dok, ergebnis: await erkennen(dok.id), fehler: null } }
  catch (e) { return { dok, ergebnis: null, fehler: (e as Error).message } }
}

export function kannErkennen(mime: string): boolean {
  return mime === 'application/pdf' || /^image\/(jpeg|png|gif|webp)$/.test(mime)
}

/** Foto verkleinern (lange Seite max. 2000 px) -> JPEG. Spart Speicher und macht die Erkennung schneller. */
async function bildLaden(file: File): Promise<{ url: string; b: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const faktor = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
  const b = Math.round(bmp.width * faktor), h = Math.round(bmp.height * faktor)
  const c = document.createElement('canvas'); c.width = b; c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, b, h)
  bmp.close?.()
  return { url: c.toDataURL('image/jpeg', 0.82), b, h }
}

/** Mehrere Scan-Fotos zu einem PDF zusammenfuegen (eine Seite pro Foto, A4). */
export async function scanZuPdf(seiten: File[], name = 'Scan'): Promise<File> {
  const { jsPDF } = await import('jspdf')
  let pdf: InstanceType<typeof jsPDF> | null = null
  for (const f of seiten) {
    const { url, b, h } = await bildLaden(f)
    const hoch = h >= b
    const format = hoch ? [210, 297] : [297, 210]
    if (!pdf) pdf = new jsPDF({ orientation: hoch ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' })
    else pdf.addPage('a4', hoch ? 'portrait' : 'landscape')
    const [pw, ph] = format
    const f2 = Math.min(pw / b, ph / h)
    const w = b * f2, hh = h * f2
    pdf.addImage(url, 'JPEG', (pw - w) / 2, (ph - hh) / 2, w, hh)
  }
  const blob = pdf!.output('blob')
  const stempel = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  return new File([blob], `${name}-${stempel}.pdf`, { type: 'application/pdf' })
}
