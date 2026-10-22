// Produktions-Auftraege: Drehtag abschliessen -> Automatik sortiert und schneidet.
// ---------------------------------------------------------------------------
// Dropbox je Kunde:  _Eingang -> 1_Videos/<Idee> -> 2_Feinschliff/<Idee> -> 3_Fertig
// Ein Auftrag entsteht, wenn jemand im CRM "Drehtag abschliessen" tippt.
// Abgeholt wird er vom stuendlichen Automatik-Lauf auf dem Schnitt-PC
// (Anleitung: 00_Agentur-Wissen/Pipeline.md in Dropbox).

import { supabase } from './supabase'

export type AuftragStatus = 'wartet' | 'laeuft' | 'feinschliff' | 'fertig' | 'fehler'

export interface Auftrag {
  id: string
  client_id: string
  ordner: string
  drehtag: string
  dateien: number | null
  status: AuftragStatus
  schritt: string | null
  notiz: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  gestartet_am: string | null
  fertig_am: string | null
}

export const STUFEN = {
  eingang: '_Eingang',
  videos: '1_Videos',
  feinschliff: '2_Feinschliff',
  fertig: '3_Fertig',
} as const

export function eingangVon(ordner: string): string {
  return `${ordner.replace(/\/+$/, '')}/${STUFEN.eingang}`
}

/** Kurzer Satz, wo der Auftrag gerade steht. Bewusst ohne Druck. */
export function statusText(a: Pick<Auftrag, 'status' | 'schritt' | 'notiz'>): string {
  switch (a.status) {
    case 'wartet': return 'Wartet auf die Automatik – startet beim nächsten stündlichen Lauf (immer um :26)'
    case 'laeuft': return a.schritt ? `Läuft: ${a.schritt}` : 'Wird sortiert und geschnitten'
    case 'feinschliff': return a.schritt || 'Liegt bei Lion im Feinschliff'
    case 'fertig': return 'Fertig – alles im Fertig-Ordner'
    case 'fehler': return a.notiz ? `Hängt: ${a.notiz}` : 'Hängt – bitte kurz reinschauen'
  }
}

/** Nur Videodateien zaehlen -- ein .DS_Store oder eine Notiz ist kein Drehmaterial. */
export function istVideo(name: string): boolean {
  return /\.(mov|mp4|m4v|hevc|avi|mts|mxf)$/i.test(name)
}

export async function ladeAuftraege(clientId: string, menge = 5): Promise<Auftrag[]> {
  const { data, error } = await supabase
    .from('produktion_auftraege')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(menge)
  if (error) throw error
  return (data ?? []) as Auftrag[]
}

export async function drehtagAbschliessen(opts: {
  clientId: string
  ordner: string
  dateien: number
  memberId: string | null
}): Promise<Auftrag> {
  const { data, error } = await supabase
    .from('produktion_auftraege')
    .insert({ client_id: opts.clientId, ordner: opts.ordner, dateien: opts.dateien, created_by: opts.memberId })
    .select('*')
    .single()
  if (error) throw error
  return data as Auftrag
}
