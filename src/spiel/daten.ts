// Laden fuer das Spiel: dieselben Tabellen wie das CRM, ein Rutsch.

import { supabase } from '../lib/supabase'
import { heute as heuteIso } from '../lib/datum'
import { ladePilot } from '../lib/pilotAktionen'
import type { Empfehlung, PilotKunde } from '../lib/pilot'
import { spielStand, type SKunde, type SpielStand, type SQuest } from '../lib/spiel'

/** Was im Studio gerade "lebt": Ofen an, Zettel am Brett, Kunden an der Wand. */
export interface StudioLeben {
  imOfen: number
  fertig: number
  kunden: { id: string; name: string; farbe: string | null; logo: string | null; gruen: boolean }[]
  vorschlaege: number
  dringend: number
  dokumente: number
}

export interface SpielDaten {
  stand: SpielStand
  leben: StudioLeben
  auftraege: Empfehlung[]
  heute: string
}

/** Was ein Pilot-Vorschlag an XP bringt, wenn man ihn erledigt (Schaetzung fuer die Anzeige). */
export function auftragXp(e: Empfehlung): number {
  switch (e.art) {
    case 'raus': return (e.zahl ?? 1) * 50
    case 'einplanen': return (e.zahl ?? 1) * 50
    case 'rueckstand': return (e.zahl ?? 1) * 50
    case 'vorrat': return (e.zahl ?? 1) * 50
    case 'kontrolle': return 300
    case 'abrechnung': return 200
    case 'links': return (e.zahl ?? 1) * 25
    case 'zahlen': return 25
    case 'erfolg': return 150
    case 'ideen': return 0
    case 'ofen': return (e.zahl ?? 1) * 50
    default: return 50
  }
}

export async function ladeSpiel(): Promise<SpielDaten> {
  const heute = heuteIso()
  const [k, v, ko, pl, q, d, pilot] = await Promise.all([
    supabase.from('clients').select('id, name, client_type, monthly_fee, monthly_quota, active, pausiert_seit, logo_url, brand_color').is('deleted_at', null),
    supabase.from('videos').select('id, client_id, title, posted_at, views, scheduled_date').eq('status', 'posted').is('deleted_at', null),
    supabase.from('monats_kontrollen').select('client_id, month_key, geprueft_bis'),
    supabase.from('client_month_plans').select('client_id, month_key, zahlstatus, betrag, quota, status, dabei'),
    supabase.from('quests').select('*').is('deleted_at', null).order('sort'),
    supabase.from('dokumente').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    ladePilot(),
  ])
  const fehler = k.error ?? v.error ?? ko.error ?? pl.error ?? q.error
  if (fehler) throw fehler
  const kunden = (k.data ?? []) as SKunde[]
  const stand = spielStand({
    kunden, videos: (v.data ?? []) as never, kontrollen: (ko.data ?? []) as never, plaene: (pl.data ?? []) as never,
    quests: (q.data ?? []) as SQuest[], heute,
  })
  const lage = new Map(pilot.lagen.map((l) => [l.kunde.client_id, l]))
  let imOfen = 0, fertig = 0
  for (const l of pilot.lagen) { const pk: PilotKunde = l.kunde; imOfen += (pk.im_ofen ?? 0) + (pk.zettel ?? 0); fertig += pk.raus ?? 0 }
  const leben: StudioLeben = {
    imOfen, fertig,
    kunden: kunden
      .filter((x) => x.active && x.client_type !== 'passiv' && x.client_type !== 'eigen')
      .sort((a, b) => Number(!!a.pausiert_seit) - Number(!!b.pausiert_seit) || Number(b.monthly_fee ?? 0) - Number(a.monthly_fee ?? 0))
      .map((x) => ({ id: x.id, name: x.name, farbe: x.brand_color, logo: x.logo_url, gruen: !!lage.get(x.id)?.gruen })),
    vorschlaege: pilot.empfehlungen.filter((e) => e.art !== 'ideen').length,
    dringend: pilot.empfehlungen.filter((e) => e.ampel === 'rot').length,
    dokumente: d.count ?? 0,
  }
  return { stand, leben, auftraege: pilot.empfehlungen, heute }
}

export async function questErledigen(id: string, memberId: string | null): Promise<void> {
  const { error } = await supabase.from('quests').update({ status: 'erledigt', erledigt_am: new Date().toISOString(), erledigt_von: memberId }).eq('id', id)
  if (error) throw error
}

export async function questZurueck(id: string): Promise<void> {
  const { error } = await supabase.from('quests').update({ status: 'offen', erledigt_am: null, erledigt_von: null }).eq('id', id)
  if (error) throw error
}

export async function questAnlegen(q: { titel: string; beschreibung?: string; xp: number; art: 'meilenstein' | 'aufgabe'; faellig?: string | null; ab_level?: number; userId?: string | null }): Promise<void> {
  const { error } = await supabase.from('quests').insert({
    titel: q.titel.trim(), beschreibung: q.beschreibung?.trim() || null, xp: q.xp, art: q.art, faellig: q.faellig || null,
    ab_level: q.ab_level ?? 0, sort: Date.now() / 1000, created_by: q.userId ?? null,
  })
  if (error) throw error
}

export async function questLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from('quests').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
