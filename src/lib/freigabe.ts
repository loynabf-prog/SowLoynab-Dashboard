// Vorschau: wer fuer den Kunden zustaendig ist, schaut das Video an (seit 27.10.2026).
// ---------------------------------------------------------------------------
// Fassie und Lion schneiden je ihre eigenen Kunden mit Claude von Anfang bis
// Ende (clients.zustaendig_id). Kein Feinschliff mehr durch den anderen.
//   2 In Arbeit/<Kunde> - <Idee>   produktion_stufe 'pruefung'
//     "Aendern"      -> Wunsch in video_aenderungen, Claude arbeitet nacheinander ab
//     "Fertig"/"Servieren" -> beste Datei nach 3 Zum Posten, Arbeitsordner ins Archiv
//                       (/Sow & Loynab Archiv/<Kunde>/<Datum> <Idee>), Stufe 'fertig'
//     "Weitergeben"  -> nur bei Problemen: Video an den anderen (videos.bearbeiter_id)

import { supabase } from './supabase'
import { ARCHIV, BASIS, dropbox, type Eintrag } from './medien'

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

export const ZUM_POSTEN = `${BASIS}/3 Zum Posten`

/** Ordnername "Kunde - Idee" aus einem Pfad */
function ordnerName(pfad: string): string {
  return pfad.replace(/\/+$/, '').split('/').pop() ?? ''
}

/**
 * Die Datei mit der besten Qualitaet im Video-Ordner: volle Qualitaet / Final /
 * Export vor allem anderen, die Vorschau nur als letzte Wahl; jeweils die neueste.
 */
export function besteDatei(eintraege: Pick<Eintrag, 'name' | 'pfad' | 'art' | 'geaendert' | 'groesse'>[]): string | null {
  const videos = eintraege.filter((e) => e.art === 'video' && /\.(mp4|mov|m4v)$/i.test(e.name))
  const rang = (n: string) => (/volle.?qualit|final|master/i.test(n) ? 0 : /export/i.test(n) ? 1 : /vorschau|proxy/i.test(n) ? 3 : 2)
  videos.sort((a, b) => rang(a.name) - rang(b.name) || (b.geaendert ?? '').localeCompare(a.geaendert ?? '') || (b.groesse ?? 0) - (a.groesse ?? 0))
  return videos[0]?.pfad ?? null
}

/**
 * Ziel im Archiv: /Sow & Loynab Archiv/<Kunde>/<Datum> <Idee>. Der Kundenname
 * kommt aus dem Ordnernamen ("U-Act Michel - Nacken"), damit er zu den
 * Dropbox-Kundenordnern passt; der CRM-Name ist nur die Notloesung.
 */
export function archivZiel(arbeitsordner: string, crmKunde: string, datum: string): string {
  const name = ordnerName(arbeitsordner)
  const teil = name.indexOf(' - ')
  const kunde = teil > 0 ? name.slice(0, teil) : crmKunde
  const idee = teil > 0 ? name.slice(teil + 3) : name
  return `${ARCHIV}/${kunde}/${datum} ${idee}`.replace(/\s+/g, ' ').trim()
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

/** Aenderungswunsch: das Video geht zurueck in den Ofen -- hinten an, oder mit vorne=true als Naechstes. */
export async function aendern(video: PruefVideo, wunsch: string, memberId: string | null, vorne = false): Promise<void> {
  const text = wunsch.trim()
  if (!text) throw new Error('Bitte kurz schreiben, was anders soll')
  const { data, error } = await supabase.from('video_aenderungen')
    .insert({ video_id: video.id, client_id: video.client_id, wunsch: text, created_by: memberId, art: 'aenderung' })
    .select('id').single()
  if (error) throw error
  if (vorne && data) {
    const { error: e2 } = await supabase.rpc('schlange_nach_vorne', { p_id: (data as { id: string }).id })
    if (e2) throw e2
  }
}

/**
 * Servieren (fertig geschnitten): die Datei mit der besten Qualitaet wandert als
 * "<Kunde> - <Idee>.mp4" nach 3 Zum Posten, der Arbeitsordner ins Archiv.
 * Video bereit zum Posten. Ist es ueberall gepostet, raeumt die Automatik die
 * Datei aus 3 Zum Posten ins Archiv dazu.
 */
export async function fertigMachen(video: PruefVideo & { scheduled_date?: string | null }, memberId: string | null): Promise<void> {
  let neu: string | null = null
  let archiv: string | null = null
  const pfad = video.dropbox_pfad?.replace(/\/+$/, '') ?? null
  if (pfad) {
    const kunde = video.clients?.name ?? 'Kunde'
    const istDatei = /\.(mp4|mov|m4v)$/i.test(pfad)
    const ordner = istDatei ? pfad.slice(0, pfad.lastIndexOf('/')) : pfad
    const datei = istDatei ? pfad : besteDatei(await dropbox.liste(ordner))
    if (datei) {
      const name = istDatei && ordner.endsWith('/3 Zum Posten') ? ordnerName(datei) : `${ordnerName(ordner)}.mp4`
      neu = await dropbox.umbenennen(datei, `${ZUM_POSTEN}/${name}`)
    }
    // Arbeitsordner nach hinten -- nur, wenn es ein eigener Video-Ordner in "2 In Arbeit" ist
    if (!istDatei && ordner.includes('/2 In Arbeit/')) {
      const datum = video.scheduled_date ?? new Date().toISOString().slice(0, 10)
      archiv = await dropbox.umbenennen(ordner, archivZiel(ordner, kunde, datum))
    }
  }
  const { error } = await supabase.rpc('video_fertig', { p_video: video.id, p_neuer_pfad: neu, p_von: memberId })
  if (error) throw error
  if (archiv) await supabase.from('videos').update({ archiv_pfad: archiv }).eq('id', video.id)
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
