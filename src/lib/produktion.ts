// Produktions-Auftraege: Drehtag abschliessen -> Automatik sortiert und schneidet.
// ---------------------------------------------------------------------------
// Dropbox (seit 22.10.2026): der Ordner ist der Status.
//   1 Briefkasten/<Kunde>  (nach dem Drehtag alles rein -- der Briefkasten-Waechter startet die Automatik)
//   -> 2 In Arbeit/<Kunde> - <Idee>  (ein Ordner pro Video: Medien, Projekt, Vorschau, NOTIZEN)
//   -> 3 Zum Posten/<Kunde> - <Idee>.mp4  (beste Qualitaet, bis ueberall gepostet)
//   -> /Sow & Loynab Archiv/<Kunde>/<Datum> <Idee>  (Hintergrund, online-only; seit 28.10.2026)
// Kundenordner (clients.dropbox_ordner): /Sow & Loynab Media/Kunden/<Kunde>
// Ein Auftrag entsteht, wenn jemand im CRM "Drehtag abschliessen" tippt.
// Abgeholt wird er vom stuendlichen Automatik-Lauf auf dem Schnitt-PC
// (Anleitung: Agentur/Automatik/Pipeline.md in Dropbox).

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
  eingang: '1 Briefkasten',
  schnitt: '2 In Arbeit',
  posten: '3 Zum Posten',
} as const

/** Briefkasten eines Kunden: <Basis>/1 Briefkasten/<Kunde>, aus dem Kundenordner <Basis>/Kunden/<Kunde>. */
export function eingangVon(ordner: string): string {
  const o = ordner.replace(/\/+$/, '')
  const i = o.lastIndexOf('/')
  const kunde = o.slice(i + 1)
  const basis = o.slice(0, i).replace(/\/Kunden$/, '')
  return `${basis}/${STUFEN.eingang}/${kunde}`
}

/** Kurzer Satz, wo der Auftrag gerade steht. Bewusst ohne Druck. */
export function statusText(a: Pick<Auftrag, 'status' | 'schritt' | 'notiz'>): string {
  switch (a.status) {
    case 'wartet': return 'Wartet auf die Automatik – startet gleich'
    case 'laeuft': return a.schritt ? `Läuft: ${a.schritt}` : 'Wird sortiert und geschnitten'
    case 'feinschliff': return a.schritt || 'Sortiert – Videos liegen in der Backstube'
    case 'fertig': return 'Fertig – alles sortiert'
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
