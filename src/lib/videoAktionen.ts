// Die Schreib-Aktionen rund ums Posten -- an einer Stelle, damit die
// Startseite, der Posting- und der Produktions-Bereich und das Board in der
// Kundenakte genau dasselbe tun.

import { supabase } from './supabase'
import type { Video } from './types'
import { vorarbeitPatch, type VorarbeitKey, type VorarbeitPatch } from './statusSync'

export type { VorarbeitKey } from './statusSync'
export type LinkFeld = 'tiktok_url' | 'instagram_url'

/**
 * Was beim Posten zusaetzlich gesetzt wird: Zeitpunkt, alle Haekchen, und
 * der Auftrag fuer die automatische Link-Abholung, sofort faellig -- das
 * neueste Posting des Kunden ist in dem Moment unseres.
 * Sind die Links schon da, gibt es nichts abzuholen.
 */
export function postenPatch(
  v: Partial<Pick<Video, 'tiktok_url' | 'instagram_url' | 'posted_at'>>,
  jetzt = new Date(),
): Record<string, unknown> {
  const p: Record<string, unknown> = {
    status: 'posted',
    posted_at: v.posted_at ?? jetzt.toISOString(),
    prep_shot: true, prep_edited: true, prep_scheduled: true,
  }
  if (!(v.tiktok_url ?? '').trim() || !(v.instagram_url ?? '').trim()) {
    // Sofort faellig: die App stoesst den Abruf direkt an (linksJetztHolen),
    // der Cron alle 5 Minuten ist nur noch die Absicherung.
    p.link_fetch_at = jetzt.toISOString()
    p.link_fetch_state = 'offen'
    p.link_fetch_tries = 0
  }
  return p
}

/** Als gepostet markieren. Gibt die Fehlermeldung zurueck oder null. */
export async function alsGepostet(
  v: Pick<Video, 'id'> & Partial<Pick<Video, 'tiktok_url' | 'instagram_url'>>,
  jetzt = new Date(),
): Promise<string | null> {
  const voll = postenPatch({ ...v, posted_at: null }, jetzt)
  const { error } = await supabase.from('videos').update(voll).eq('id', v.id)
  if (!error) {
    if ('link_fetch_at' in voll) linksJetztHolen(v.id)
    return null
  }
  // Fehlen die neueren Spalten noch (Skript 0031/0033), reicht das Noetige.
  const { error: e2 } = await supabase.from('videos')
    .update({ status: 'posted', posted_at: voll.posted_at }).eq('id', v.id)
  return e2 ? e2.message : null
}

/**
 * Direkt nach "Gepostet" die Links und ersten Zahlen holen: das neueste
 * Posting des Kunden ist in dem Moment unseres. Laeuft im Hintergrund
 * (Apify braucht bis zu einer Minute); das Ergebnis kommt ueber den
 * Live-Abgleich in die Ansicht. Klappt es nicht, faengt der Cron es auf.
 */
export function linksJetztHolen(videoId: string): void {
  supabase.functions.invoke('fetch-post-links', { body: { video_id: videoId } }).catch(() => {})
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

/**
 * Ein Vorarbeit-Haekchen setzen -- mit allem, was daraus folgt (fruehere
 * Schritte, Board-Status). Gibt den geschriebenen Patch zurueck, damit die
 * Oberflaeche genau das zeigt, was in der Datenbank steht.
 */
export async function vorarbeitSetzen(
  v: Pick<Video, 'id' | 'status'> & Partial<Pick<Video, VorarbeitKey>>,
  key: VorarbeitKey,
  wert: boolean,
): Promise<{ patch: VorarbeitPatch; fehler: string | null }> {
  const patch = vorarbeitPatch(v, key, wert)
  const { error } = await supabase.from('videos').update(patch).eq('id', v.id)
  return { patch, fehler: error ? error.message : null }
}

/** Posting-Tag verschieben. Gibt die Fehlermeldung zurueck oder null. */
export async function terminSetzen(id: string, datum: string): Promise<string | null> {
  const { error } = await supabase.from('videos').update({ scheduled_date: datum }).eq('id', id)
  return error ? error.message : null
}
