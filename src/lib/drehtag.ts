// Drehtage: Termine, an denen gedreht wird.
// ---------------------------------------------------------------------------
// Der Drehtag ist nicht der Posting-Tag. Fünf Videos entstehen an einem
// Nachmittag und gehen über zwei Wochen verteilt raus. Deshalb hängt am
// Video beides: scheduled_date fürs Posten, shoot_event_id fürs Drehen.

import { supabase } from './supabase'
import type { CalEventRow, Video } from './types'
import { rufeFunktion } from './funktion'

export interface DrehVideo extends Video { }

/** Die Videos, die an diesem Drehtag entstehen. */
export async function ladeDrehVideos(eventId: string): Promise<DrehVideo[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('shoot_event_id', eventId)
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as unknown as DrehVideo[]
}

/**
 * Wie weit ist der Drehtag?
 *
 * `soll` ist das Ziel aus dem Termin, `dran` was tatsaechlich haengt. Die
 * Luecke dazwischen ist die interessante Zahl -- sie sagt, ob noch Videos
 * zuzuordnen sind.
 */
export function drehStand(termin: Pick<CalEventRow, 'planned_videos'>, videos: DrehVideo[]) {
  const soll = termin.planned_videos ?? 0
  const dran = videos.length
  const mitSkript = videos.filter((v) => (v.script ?? '').trim() !== '').length
  const gedreht = videos.filter((v) => v.prep_shot).length
  return {
    soll,
    dran,
    fehlen: Math.max(0, soll - dran),
    mitSkript,
    ohneSkript: dran - mitSkript,
    gedreht,
    fertig: dran > 0 && gedreht >= dran,
  }
}

/** Kandidaten zum Zuordnen: Videos des Kunden, die noch an keinem Drehtag hängen. */
export async function ladeFreieVideos(clientId: string): Promise<Video[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .is('shoot_event_id', null)
    .neq('status', 'posted')
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .limit(60)
  if (error) return []
  return (data ?? []) as unknown as Video[]
}

export async function haengeAn(videoId: string, eventId: string | null) {
  return supabase.from('videos').update({ shoot_event_id: eventId }).eq('id', videoId)
}

export async function speichereSkript(videoId: string, script: string) {
  return supabase.from('videos').update({ script }).eq('id', videoId)
}

/**
 * Skripte für den ganzen Drehtag schreiben lassen.
 *
 * Alle Videos zusammen, damit die KI zusammenfassen kann, was am selben Ort
 * passiert -- einzeln gefragt käme fünfmal derselbe Aufbau heraus.
 */
export async function schreibeSkripte(opts: {
  videos: { id: string; titel: string; idee?: string | null }[]
  kunde?: string
  briefing?: string
  ort?: string
  datum?: string
}): Promise<{ skripte: { id: string; script: string }[]; tagesplan: string }> {
  const a = await rufeFunktion<any>('generate-script', opts)
  return {
    skripte: Array.isArray(a?.skripte) ? a.skripte : [],
    tagesplan: String(a?.tagesplan ?? ''),
  }
}
