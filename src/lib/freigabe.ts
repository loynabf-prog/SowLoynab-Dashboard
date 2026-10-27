// Vorschau: wer fuer den Kunden zustaendig ist, schaut das Video an (seit 27.10.2026).
// ---------------------------------------------------------------------------
// Fassie und Lion schneiden je ihre eigenen Kunden mit Claude von Anfang bis
// Ende (clients.zustaendig_id). Kein Feinschliff mehr durch den anderen.
//   2 Im Schnitt/<Kunde> - <Idee>   produktion_stufe 'pruefung'
//     "Aendern"      -> Wunsch in video_aenderungen, Claude arbeitet nacheinander ab
//     "Fertig"       -> Ordner nach 4 Fertig, Stufe 'fertig': bereit zum Posten
//     "Weitergeben"  -> nur bei Problemen: Video an den anderen (videos.bearbeiter_id)

import { supabase } from './supabase'
import { BASIS, dropbox } from './medien'

export interface PruefVideo {
  id: string
  title: string
  client_id: string
  dropbox_pfad: string | null
  updated_at?: string | null
  produktion_stufe?: string | null
  /** Nur gesetzt, wenn das Video weitergegeben wurde (0062). */
  bearbeiter_id?: string | null
  clients?: { name: string; logo_url?: string | null; zustaendig_id?: string | null } | null
}

/** Wer schneidet dieses Video gerade? Weitergegeben > zustaendig fuer den Kunden. */
export function bearbeiterVon(v: Pick<PruefVideo, 'bearbeiter_id' | 'clients'>): string | null {
  return v.bearbeiter_id ?? v.clients?.zustaendig_id ?? null
}

export interface Aenderung {
  id: string
  video_id: string
  wunsch: string
  status: 'offen' | 'laeuft' | 'erledigt' | 'fehler' | 'uebergeben'
  notiz: string | null
  created_at: string
  erledigt_am: string | null
}

export const FEINSCHLIFF = `${BASIS}/3 Feinschliff`
export const FERTIG = `${BASIS}/4 Fertig`

/** Zielordner in 3 Feinschliff: gleicher Ordnername wie in 2 Im Schnitt. */
export function feinschliffPfad(pfad: string): string {
  const name = pfad.replace(/\/+$/, '').split('/').pop() ?? ''
  return `${FEINSCHLIFF}/${name}`
}

export function vorschauPfad(pfad: string): string {
  return `${pfad.replace(/\/+$/, '')}/Vorschau.mp4`
}

/** Platz in der Warteschlange (1 = als Naechstes dran), null wenn nicht offen. */
export function platzInSchlange(alle: Pick<Aenderung, 'id' | 'status' | 'created_at'>[], id: string): number | null {
  const offen = alle
    .filter((a) => a.status === 'offen')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const i = offen.findIndex((a) => a.id === id)
  if (i < 0) return null
  // Laeuft gerade etwas, ist der erste offene Wunsch erst danach dran.
  return i + 1 + (alle.some((a) => a.status === 'laeuft') ? 1 : 0)
}

/** Was der Knopfbereich zeigen soll: frei entscheiden, oder ein Wunsch ist unterwegs. */
export function offeneRunde(liste: Aenderung[], videoId: string): Aenderung | null {
  return liste
    .filter((a) => a.video_id === videoId && (a.status === 'offen' || a.status === 'laeuft'))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
}

export async function ladeFreigaben(): Promise<{ videos: PruefVideo[]; aenderungen: Aenderung[] }> {
  const [v, a] = await Promise.all([
    supabase.from('videos').select('id, title, client_id, dropbox_pfad, updated_at, produktion_stufe, bearbeiter_id, clients(name, logo_url, zustaendig_id)')
      .in('produktion_stufe', ['pruefung', 'feinschliff']).neq('status', 'posted').is('deleted_at', null).order('updated_at', { ascending: true }),
    supabase.from('video_aenderungen').select('id, video_id, wunsch, status, notiz, created_at, erledigt_am')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
  ])
  if (v.error) throw v.error
  if (a.error) throw a.error
  return { videos: (v.data ?? []) as unknown as PruefVideo[], aenderungen: (a.data ?? []) as Aenderung[] }
}

export async function aendern(video: PruefVideo, wunsch: string, memberId: string | null): Promise<void> {
  const text = wunsch.trim()
  if (!text) throw new Error('Bitte kurz schreiben, was anders soll')
  const { error } = await supabase.from('video_aenderungen')
    .insert({ video_id: video.id, client_id: video.client_id, wunsch: text, created_by: memberId })
  if (error) throw error
}

/** Ordner nach 3 Feinschliff, Video umstellen, Aufgabe + Karte fuer Lion, Push an Lion. */
export async function freigeben(video: PruefVideo, memberId: string | null, lionId: string | null): Promise<void> {
  if (!video.dropbox_pfad) throw new Error('Kein Dropbox-Ordner hinterlegt')
  const [r] = await dropbox.verschieben([video.dropbox_pfad], FEINSCHLIFF)
  if (!r?.ok) throw new Error('Ordner ließ sich nicht verschieben: ' + (r?.fehler ?? 'unbekannt'))
  const neu = r.neu ?? feinschliffPfad(video.dropbox_pfad)
  const { error } = await supabase.rpc('video_freigeben', { p_video: video.id, p_neuer_pfad: neu, p_von: memberId })
  if (error) throw error
  if (lionId && lionId !== memberId) {
    try {
      await supabase.functions.invoke('send-push', {
        body: {
          member_id: lionId,
          title: '🎬 Neuer Feinschliff',
          body: `${video.title} (${video.clients?.name ?? 'Kunde'}) ist freigegeben und liegt in 3 Feinschliff.`,
          link: '/chat',
        },
      })
    } catch { /* Push ist optional */ }
  }
}

/** Fertig geschnitten: Ordner nach 4 Fertig, Video bereit zum Posten. */
export async function fertigMachen(video: PruefVideo, memberId: string | null): Promise<void> {
  let neu: string | null = null
  if (video.dropbox_pfad) {
    const [r] = await dropbox.verschieben([video.dropbox_pfad], FERTIG)
    if (!r?.ok) throw new Error('Ordner ließ sich nicht verschieben: ' + (r?.fehler ?? 'unbekannt'))
    neu = r.neu ?? `${FERTIG}/${video.dropbox_pfad.replace(/\/+$/, '').split('/').pop()}`
  }
  const { error } = await supabase.rpc('video_fertig', { p_video: video.id, p_neuer_pfad: neu, p_von: memberId })
  if (error) throw error
}

/** Nur bei Problemen: Video an den anderen geben (Aufgabe, Chat-Karte, Push). */
export async function weitergeben(video: PruefVideo, an: string, von: string | null, notiz?: string): Promise<void> {
  const { error } = await supabase.rpc('video_weitergeben', { p_video: video.id, p_an: an, p_von: von, p_notiz: notiz ?? null })
  if (error) throw error
  try {
    await supabase.functions.invoke('send-push', {
      body: { member_id: an, title: '↪ Video für dich', body: `${video.title} (${video.clients?.name ?? 'Kunde'})`, link: '/' },
    })
  } catch { /* Push ist optional */ }
}
