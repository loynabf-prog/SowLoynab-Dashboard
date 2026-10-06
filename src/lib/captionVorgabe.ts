// Hausstil fuer Captions: Hashtags und Tonalitaet.
// ---------------------------------------------------------------------------
// Wir benutzen ohnehin immer dieselben Hashtags. Statt sie jedes Mal
// mitzudiktieren, stehen sie einmal in den Einstellungen und werden an jede
// Caption angehaengt.
//
// Liegt im JSON von app_settings -- keine eigene Tabelle noetig.

import { supabase } from './supabase'

export interface CaptionVorgabe {
  /** Feste Hashtags, die immer ans Ende kommen. */
  hashtags?: string
  /** Ein Satz zum Ton, z. B. "locker, nie werblich, Münsteraner Dialektfarbe". */
  tonalitaet?: string
}

export async function getCaptionVorgabe(): Promise<CaptionVorgabe> {
  const { data } = await supabase.from('app_settings').select('data').eq('id', 1).single()
  return ((data?.data as any)?.caption ?? {}) as CaptionVorgabe
}

export async function saveCaptionVorgabe(caption: CaptionVorgabe): Promise<void> {
  const { data } = await supabase.from('app_settings').select('data').eq('id', 1).single()
  const next = { ...((data?.data as any) ?? {}), caption }
  await supabase.from('app_settings').update({ data: next, updated_at: new Date().toISOString() }).eq('id', 1)
}

/**
 * Feste Hashtags ans Ende haengen -- aber keinen doppelt.
 *
 * Die KI streut selbst schon Hashtags ein; stuende #muenster dann zweimal
 * drunter, sieht das nach Maschine aus.
 */
export function mitHashtags(caption: string, hashtags?: string): string {
  const feste = (hashtags ?? '').trim()
  if (!feste) return caption.trim()

  const vorhanden = new Set(
    (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()),
  )
  const neue = (feste.match(/#[\p{L}\p{N}_]+/gu) ?? [])
    .filter((h) => !vorhanden.has(h.toLowerCase()))

  if (neue.length === 0) return caption.trim()
  return `${caption.trim()}\n${neue.join(' ')}`
}
