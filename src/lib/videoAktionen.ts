// Die Schreib-Aktionen rund ums Posten -- an einer Stelle, damit die
// Startseite und der Posting-Bereich genau dasselbe tun.

import { supabase } from './supabase'

export type VorarbeitKey = 'prep_shot' | 'prep_edited' | 'prep_scheduled'
export type LinkFeld = 'tiktok_url' | 'instagram_url'

/**
 * Als gepostet markieren. Dabei merken wir uns einen Zeitpunkt ein paar
 * Minuten spaeter: dann ist das Video online und zuverlaessig das neueste
 * Posting des Kunden -- der Hintergrundlauf holt die Adressen dann selbst.
 */
export async function alsGepostet(id: string, jetzt = new Date()): Promise<void> {
  const iso = jetzt.toISOString()
  const holen = new Date(jetzt.getTime() + 5 * 60_000).toISOString()
  const { error } = await supabase.from('videos').update({
    status: 'posted', posted_at: iso,
    prep_shot: true, prep_edited: true, prep_scheduled: true,
    link_fetch_at: holen, link_fetch_state: 'offen', link_fetch_tries: 0,
  }).eq('id', id)
  // Fehlen die neueren Spalten noch (Skript 0031/0033), reicht das Noetige.
  if (error) await supabase.from('videos').update({ status: 'posted', posted_at: iso }).eq('id', id)
}

/**
 * Adresse von Hand eintragen. Danach hat der Hintergrundlauf hier nichts
 * mehr zu suchen, sonst ueberschreibt er spaeter die bessere Angabe.
 * Gibt die Fehlermeldung zurueck oder null.
 */
export async function linkSetzen(id: string, feld: LinkFeld, url: string): Promise<string | null> {
  const { error } = await supabase.from('videos')
    .update({ [feld]: url, link_fetch_at: null, link_fetch_state: 'fertig', link_fetch_note: null })
    .eq('id', id)
  if (!error) return null
  const { error: e2 } = await supabase.from('videos').update({ [feld]: url }).eq('id', id)
  return e2 ? e2.message : null
}

/** Ein Vorarbeit-Haekchen setzen. Gibt die Fehlermeldung zurueck oder null. */
export async function vorarbeitSetzen(id: string, key: VorarbeitKey, wert: boolean): Promise<string | null> {
  const { error } = await supabase.from('videos').update({ [key]: wert }).eq('id', id)
  return error ? error.message : null
}
