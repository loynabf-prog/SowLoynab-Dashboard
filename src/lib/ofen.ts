// Schnittofen: Warteschlange -> Im Ofen -> Raus (Vorschau) -> Tablett (bereit zum Posten)
// -------------------------------------------------------------------------
// Die Schlange ist video_aenderungen (Migration 0063): jeder Eintrag ist ein
// Auftrag an die Schnitt-Automatik -- entweder ein Video zum ersten Mal
// schneiden (art 'erstschnitt', wunsch = Anweisung) oder eine Aenderung an
// einer Vorschau. Die Automatik nimmt immer genau einen, in der Reihenfolge
// von 'reihenfolge' (schlange_naechster()).

import { supabase } from './supabase'
import { rangVon } from './kundenart'

export interface OfenVideo {
  id: string
  title: string | null
  client_id: string
  produktion_stufe: string | null
  status: string
  scheduled_date: string | null
  bearbeiter_id?: string | null
  clients?: { name: string; logo_url?: string | null; client_type?: string | null; zustaendig_id?: string | null } | null
}

export interface OfenAuftrag {
  id: string
  video_id: string
  art: 'erstschnitt' | 'aenderung'
  wunsch: string
  status: 'offen' | 'laeuft' | 'erledigt' | 'fehler' | 'uebergeben'
  reihenfolge: number | null
  created_at: string
  gestartet_am: string | null
  notiz: string | null
  videos?: OfenVideo | null
}

export interface Ofen {
  imOfen: OfenAuftrag | null
  schlange: OfenAuftrag[]
  /** Haengt: Fehler, die jemand ansehen muss */
  haengt: OfenAuftrag[]
  tablett: OfenVideo[]
}

/** Sortierung und Aufteilung -- ohne Datenbank, damit testbar. */
export function baueOfen(auftraege: OfenAuftrag[], fertige: OfenVideo[]): Ofen {
  const lebend = auftraege.filter((a) => a.videos)
  const imOfen = lebend.filter((a) => a.status === 'laeuft')
    .sort((a, b) => (a.gestartet_am ?? a.created_at).localeCompare(b.gestartet_am ?? b.created_at))[0] ?? null
  const schlange = lebend.filter((a) => a.status === 'offen')
    .sort((a, b) => (a.reihenfolge ?? Infinity) - (b.reihenfolge ?? Infinity) || a.created_at.localeCompare(b.created_at))
  const haengt = lebend.filter((a) => a.status === 'fehler')
  const tablett = [...fertige].sort((a, b) =>
    rangVon(a.clients?.client_type) - rangVon(b.clients?.client_type)
    || (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999'))
  return { imOfen, schlange, haengt, tablett }
}

const VIDEO = 'videos(id, title, client_id, produktion_stufe, status, scheduled_date, bearbeiter_id, clients(name, logo_url, client_type, zustaendig_id))'

export async function ladeOfen(): Promise<Ofen> {
  const seit = new Date(Date.now() - 7 * 86400_000).toISOString()
  const [a, f] = await Promise.all([
    supabase.from('video_aenderungen')
      .select(`id, video_id, art, wunsch, status, reihenfolge, created_at, gestartet_am, notiz, ${VIDEO}`)
      .is('deleted_at', null)
      .or(`status.in.(offen,laeuft),and(status.eq.fehler,updated_at.gte.${seit})`),
    supabase.from('videos')
      .select('id, title, client_id, produktion_stufe, status, scheduled_date, bearbeiter_id, clients(name, logo_url, client_type, zustaendig_id)')
      .is('deleted_at', null).eq('produktion_stufe', 'fertig').in('status', ['ready', 'todo']),
  ])
  if (a.error) throw a.error
  return baueOfen((a.data ?? []) as unknown as OfenAuftrag[], (f.data ?? []) as unknown as OfenVideo[])
}

/** Video in den Ofen schieben: mit Anweisung hinten anstellen (oder gleich nach vorne). */
export async function inDenOfen(opts: {
  video: Pick<OfenVideo, 'id' | 'client_id' | 'produktion_stufe'>
  anweisung: string
  art?: 'erstschnitt' | 'aenderung'
  vorne?: boolean
  memberId: string | null
}): Promise<void> {
  const text = opts.anweisung.trim()
  if (!text) throw new Error('Kurz schreiben, wie das Video werden soll')
  const art = opts.art ?? (opts.video.produktion_stufe && opts.video.produktion_stufe !== 'roh' ? 'aenderung' : 'erstschnitt')
  const { data, error } = await supabase.from('video_aenderungen')
    .insert({ video_id: opts.video.id, client_id: opts.video.client_id, wunsch: text, art, created_by: opts.memberId })
    .select('id').single()
  if (error) throw error
  if (!opts.video.produktion_stufe) {
    await supabase.from('videos').update({ produktion_stufe: 'roh' }).eq('id', opts.video.id)
  }
  if (opts.vorne) await nachVorne((data as { id: string }).id)
}

export async function nachVorne(id: string): Promise<void> {
  const { error } = await supabase.rpc('schlange_nach_vorne', { p_id: id })
  if (error) throw error
}

/** Aus der Schlange nehmen (landet im Papierkorb, nichts geht verloren). */
export async function ausDerSchlange(id: string): Promise<void> {
  const { error } = await supabase.from('video_aenderungen').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('status', 'offen')
  if (error) throw error
}

/** Haengenden Auftrag noch mal versuchen: wieder hinten anstellen. */
export async function nochmal(id: string): Promise<void> {
  const { error } = await supabase.from('video_aenderungen')
    .update({ status: 'offen', reihenfolge: Date.now() / 1000 }).eq('id', id)
  if (error) throw error
}

/** Seit wann im Ofen, kurz: "seit 12 Min." */
export function seitText(iso: string | null, jetzt = Date.now()): string {
  if (!iso) return ''
  const min = Math.max(0, Math.round((jetzt - Date.parse(iso)) / 60_000))
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  return `${h} Std. ${min % 60} Min.`
}
