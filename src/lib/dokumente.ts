// Agentur-Dokumente (Migration 0070): Gewerbeanmeldung, Steuer, Vertraege,
// Versicherung ... als Datei im CRM. Die Datei liegt im privaten Bucket
// "dokumente"; geoeffnet wird ueber eine kurzlebige signierte Adresse.

import { supabase } from './supabase'

export const DOK_BUCKET = 'dokumente'

export type DokKategorie = 'behoerde' | 'steuer' | 'vertrag' | 'versicherung' | 'bank' | 'vorlage' | 'sonstiges'

export const KATEGORIEN: { key: DokKategorie; label: string; hinweis: string }[] = [
  { key: 'behoerde', label: 'Behörde', hinweis: 'Gewerbeanmeldung, Handelsregister, Bescheide' },
  { key: 'steuer', label: 'Steuer', hinweis: 'Steuernummer, USt-ID, Bescheide, Steuerberater' },
  { key: 'vertrag', label: 'Verträge', hinweis: 'GbR-Vertrag, Mietvertrag, Abos' },
  { key: 'versicherung', label: 'Versicherung', hinweis: 'Policen, Haftpflicht' },
  { key: 'bank', label: 'Bank', hinweis: 'Kontoeröffnung, Vollmachten' },
  { key: 'vorlage', label: 'Vorlagen', hinweis: 'Angebote, Rechnungsvorlage, Briefpapier' },
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
export async function hochladen(opts: { file: File; titel: string; kategorie: DokKategorie; notiz?: string; gueltigBis?: string | null; userId?: string | null }): Promise<Dokument> {
  const { file } = opts
  const pfad = `${opts.kategorie}/${Date.now()}-${sichererName(file.name)}`
  const { error } = await supabase.storage.from(DOK_BUCKET).upload(pfad, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  const { data, error: e2 } = await supabase.from('dokumente').insert({
    titel: opts.titel.trim() || file.name, kategorie: opts.kategorie, dateiname: file.name, pfad,
    mime: file.type || null, groesse: file.size, notiz: opts.notiz?.trim() || null, gueltig_bis: opts.gueltigBis || null,
    created_by: opts.userId ?? null,
  }).select('*').single()
  if (e2) throw e2
  return data as Dokument
}

export async function aendern(id: string, patch: Partial<Pick<Dokument, 'titel' | 'kategorie' | 'notiz' | 'gueltig_bis'>>): Promise<void> {
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
  if (/vorlage|template|angebot|briefpapier/.test(n)) return 'vorlage'
  return 'sonstiges'
}
