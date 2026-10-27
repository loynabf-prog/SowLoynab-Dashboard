// Die Schreib-Aktionen rund ums Posten -- an einer Stelle, damit die
// Startseite, der Posting- und der Produktions-Bereich und das Board in der
// Kundenakte genau dasselbe tun.

import { supabase } from './supabase'
import type { Video } from './types'
import { vorarbeitPatch, type VorarbeitKey, type VorarbeitPatch } from './statusSync'
import { ABGEBROCHEN, betriebFuerPosten, istPlatzhalter } from './betriebWahl'

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
  // Zwei Betriebe beim Kunden? Dann kurz fragen, welcher gepostet hat --
  // sonst weiss die Link-Abholung nicht, welchen Account sie lesen soll.
  const { data: zeile } = await supabase.from('videos').select('client_id, channel_id').eq('id', v.id).maybeSingle()
  if (zeile && (zeile as any).client_id) {
    const b = await betriebFuerPosten((zeile as any).client_id, (zeile as any).channel_id)
    if (!b.ok) return ABGEBROCHEN
    if (b.channelId && b.channelId !== (zeile as any).channel_id) voll.channel_id = b.channelId
  }
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
/** Titel fuer ein Video, das erst nachtraeglich angelegt wird -- die Link-Abholung ersetzt ihn durch die Caption. */
export const SCHNELL_TITEL = 'Gepostetes Video'

/**
 * "Video gepostet" ohne vorher angelegtes Video: legt es als gepostet an
 * und holt sofort Link, Zahlen und Caption des neuesten Postings.
 * Gibt die Fehlermeldung zurueck oder null.
 */
export async function schnellGepostet(clientId: string, jetzt = new Date()): Promise<string | null> {
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt)
  const b = await betriebFuerPosten(clientId, null)
  if (!b.ok) return ABGEBROCHEN
  const gepostet = {
    title: SCHNELL_TITEL, status: 'posted',
    scheduled_date: heute, posted_at: jetzt.toISOString(),
    prep_shot: true, prep_edited: true, prep_scheduled: true,
    link_fetch_at: jetzt.toISOString(), link_fetch_state: 'offen', link_fetch_tries: 0,
    ...(b.channelId ? { channel_id: b.channelId } : {}),
  }

  // Erst einen offenen Platzhalter dieses Monats aufbrauchen ("Oktober 6"),
  // statt ein zusaetzliches Video anzulegen -- sonst zaehlt der Monat doppelt
  // und der Platzhalter steht spaeter als "verpasst" da.
  const slot = await freierSlot(clientId, heute, b.channelId)
  if (slot) {
    const { error } = await supabase.from('videos').update(gepostet).eq('id', slot)
    if (error) return error.message
    linksJetztHolen(slot)
    return null
  }

  const { data, error } = await supabase.from('videos').insert({ client_id: clientId, ...gepostet }).select('id').single()
  if (error) return error.message
  linksJetztHolen((data as { id: string }).id)
  return null
}

/** Aeltester noch offener Platzhalter des laufenden Monats (passender Betrieb oder ohne). */
async function freierSlot(clientId: string, heute: string, channelId: string | null): Promise<string | null> {
  const monat = heute.slice(0, 7)
  const { data } = await supabase.from('videos')
    .select('id, title, channel_id, scheduled_date')
    .eq('client_id', clientId).is('deleted_at', null).neq('status', 'posted')
    .gte('scheduled_date', `${monat}-01`).lte('scheduled_date', `${monat}-31`)
    .order('scheduled_date', { ascending: true })
  return waehleSlot((data ?? []) as SlotKandidat[], channelId)
}

export interface SlotKandidat { id: string; title: string | null; channel_id?: string | null; scheduled_date: string | null }
export function waehleSlot(kandidaten: SlotKandidat[], channelId: string | null): string | null {
  const t = kandidaten.find((k) => istPlatzhalter(k.title) && (!k.channel_id || !channelId || k.channel_id === channelId))
  return t ? t.id : null
}

/** Abholung neu starten (z. B. nach "fehlgeschlagen") und sofort ausloesen. */
export async function linksErneutHolen(videoId: string): Promise<string | null> {
  const patch: Record<string, unknown> = { link_fetch_at: new Date().toISOString(), link_fetch_state: 'offen', link_fetch_tries: 0, link_fetch_note: null }
  // Fehlt der Betrieb (das war meist der Grund fuers Scheitern), jetzt fragen.
  const { data: zeile } = await supabase.from('videos').select('client_id, channel_id').eq('id', videoId).maybeSingle()
  if (zeile && (zeile as any).client_id) {
    const b = await betriebFuerPosten((zeile as any).client_id, (zeile as any).channel_id)
    if (!b.ok) return ABGEBROCHEN
    if (b.channelId) patch.channel_id = b.channelId
  }
  const { error } = await supabase.from('videos')
    .update(patch)
    .eq('id', videoId)
  if (error) return error.message
  linksJetztHolen(videoId)
  return null
}

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
