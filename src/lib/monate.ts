// In Monaten planen (Migration 0046).
// ---------------------------------------------------------------------------
// Je Kunde und Monat ein Eintrag in client_month_plans: Videos, Betrag,
// Stand (geplant / fest / abgeschlossen). Ein Eintrag mit 0 Videos und 0 EUR
// heisst "in diesem Monat nicht dabei".
//
// Ohne Eintrag gilt fuer den laufenden und kommende Monate der Retainer als
// VORSCHLAG (grau, mit einem Tipp uebernehmbar). Vergangene Monate zaehlen
// nur mit Eintrag -- sonst wuerde eine spaetere Retainer-Aenderung die
// Vergangenheit umschreiben. Ein abgeschlossener Monat bekommt keine
// Vorschlaege mehr.
//
// Videos zaehlen zu genau einem Monat: abrechnungsmonat, sonst der Monat
// des Posting-Tags, sonst der Monat, in dem gepostet wurde.

import { supabase } from './supabase'

export type MonatStatus = 'geplant' | 'unsicher' | 'fest' | 'abgeschlossen'

export interface MonatsEintrag {
  id?: string
  client_id: string
  month_key: string
  quota: number
  betrag: number | null
  status: MonatStatus
  notiz: string | null
  /** Monat, in dem das Geld voraussichtlich kommt (0047), sonst null. */
  zahlung_monat?: string | null
  /** false = bewusst nicht dabei (0047). */
  dabei?: boolean
}

export interface KundeFuerMonat {
  id: string
  name: string
  logo_url: string | null
  monthly_quota: number | null
  monthly_fee: number | string | null
  active: boolean
  client_type: string | null
  pausiert_seit?: string | null
}

export interface MonatsVideo {
  id: string
  client_id: string
  title: string | null
  status: string
  scheduled_date: string | null
  posted_at: string | null
  abrechnungsmonat?: string | null
}

export type Herkunft = 'eintrag' | 'vorschlag'

export interface MonatsZeile {
  kunde: KundeFuerMonat
  herkunft: Herkunft
  eintrag: MonatsEintrag | null
  soll: number
  betrag: number
  status: MonatStatus | 'vorschlag'
  videos: MonatsVideo[]
  gepostet: number
  /** 0 Videos und 0 EUR eingetragen = bewusst nicht dabei. */
  nichtDabei: boolean
}

// ------------------------------------------------------------------ Monate
export function monatsKeyVon(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monatPlus(key: string, n: number): string {
  const [j, m] = key.split('-').map(Number)
  const d = new Date(j, m - 1 + n, 1)
  return monatsKeyVon(d)
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function monatName(key: string, kurz = false): string {
  const [j, m] = key.split('-').map(Number)
  const n = MONATE[m - 1] ?? key
  return kurz ? n.slice(0, 3) : `${n} ${j}`
}

/** Zu welchem Monat zaehlt ein Video? */
export function zuordnungsMonat(v: MonatsVideo): string | null {
  if (v.abrechnungsmonat) return v.abrechnungsmonat
  if (v.scheduled_date) return v.scheduled_date.slice(0, 7)
  if (v.posted_at) return v.posted_at.slice(0, 7)
  return null
}

function zahl(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return isFinite(n) ? n : 0
}

/** Bekommt ein Kunde ohne Eintrag den Retainer als Vorschlag? */
export function bekommtVorschlag(k: KundeFuerMonat): boolean {
  return k.active !== false
    && (k.client_type ?? 'zahlend') === 'zahlend'
    && ((k.monthly_quota ?? 0) > 0 || zahl(k.monthly_fee) > 0)
}

/** Ist der Monat abgeschlossen? Sobald ein Eintrag "abgeschlossen" ist. */
export function istAbgeschlossen(eintraege: MonatsEintrag[], key: string): boolean {
  return eintraege.some((e) => e.month_key === key && e.status === 'abgeschlossen')
}

/**
 * Alle Kunden eines Monats: Eintraege plus (fuer laufende und kommende,
 * nicht abgeschlossene Monate) Retainer-Vorschlaege.
 */
export function monatsZeilen(
  key: string,
  heuteKey: string,
  kunden: KundeFuerMonat[],
  eintraege: MonatsEintrag[],
  videos: MonatsVideo[],
): MonatsZeile[] {
  const imMonat = eintraege.filter((e) => e.month_key === key)
  const proKunde = new Map(imMonat.map((e) => [e.client_id, e]))
  const vorschlaegeErlaubt = key >= heuteKey && !istAbgeschlossen(eintraege, key)
  const vidProKunde = new Map<string, MonatsVideo[]>()
  for (const v of videos) {
    if (zuordnungsMonat(v) !== key) continue
    ;(vidProKunde.get(v.client_id) ?? vidProKunde.set(v.client_id, []).get(v.client_id)!).push(v)
  }

  const zeilen: MonatsZeile[] = []
  for (const k of kunden) {
    const e = proKunde.get(k.id) ?? null
    const vids = vidProKunde.get(k.id) ?? []
    const gepostet = vids.filter((v) => v.status === 'posted').length
    if (e) {
      zeilen.push({
        kunde: k, herkunft: 'eintrag', eintrag: e,
        soll: e.quota, betrag: e.betrag != null ? zahl(e.betrag) : zahl(k.monthly_fee),
        status: e.status, videos: vids, gepostet,
        nichtDabei: e.dabei === false,
      })
    } else if (vorschlaegeErlaubt && bekommtVorschlag(k)) {
      zeilen.push({
        kunde: k, herkunft: 'vorschlag', eintrag: null,
        soll: k.monthly_quota ?? 0, betrag: zahl(k.monthly_fee),
        status: 'vorschlag', videos: vids, gepostet, nichtDabei: false,
      })
    } else if (vids.length > 0) {
      // Videos ohne Vereinbarung: trotzdem zeigen, damit nichts verschwindet.
      zeilen.push({
        kunde: k, herkunft: 'vorschlag', eintrag: null,
        soll: 0, betrag: 0, status: 'vorschlag', videos: vids, gepostet, nichtDabei: false,
      })
    }
  }
  const rang = (z: MonatsZeile) => (z.nichtDabei ? 3 : z.herkunft === 'vorschlag' ? 1 : 0)
  return zeilen.sort((a, b) => rang(a) - rang(b) || b.betrag - a.betrag || a.kunde.name.localeCompare(b.kunde.name))
}

export interface MonatsSumme {
  fest: number          // fest + abgeschlossen
  geplant: number       // nur geplant
  unsicher: number      // mit Fragezeichen
  vorschlag: number     // Retainer ohne Eintrag
  videosSoll: number
  videosAngelegt: number
  videosGepostet: number
  kunden: number
}

export function monatsSumme(zeilen: MonatsZeile[]): MonatsSumme {
  const s: MonatsSumme = { fest: 0, geplant: 0, unsicher: 0, vorschlag: 0, videosSoll: 0, videosAngelegt: 0, videosGepostet: 0, kunden: 0 }
  for (const z of zeilen) {
    if (z.nichtDabei) continue
    if (z.status === 'fest' || z.status === 'abgeschlossen') s.fest += z.betrag
    else if (z.status === 'geplant') s.geplant += z.betrag
    else if (z.status === 'unsicher') s.unsicher += z.betrag
    else s.vorschlag += z.betrag
    s.videosSoll += z.soll
    s.videosAngelegt += z.videos.length
    s.videosGepostet += z.gepostet
    if (z.soll > 0 || z.betrag > 0) s.kunden++
  }
  return s
}

export function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

// --------------------------------------------------------------- Speichern
export async function ladeMonatsDaten(von: string, bis: string) {
  const [k, e, v] = await Promise.all([
    supabase.from('clients')
      .select('id, name, logo_url, monthly_quota, monthly_fee, active, client_type, pausiert_seit')
      .is('deleted_at', null).order('name'),
    supabase.from('client_month_plans')
      .select('id, client_id, month_key, quota, betrag, status, notiz, zahlung_monat, dabei')
      .gte('month_key', von).lte('month_key', bis),
    supabase.from('videos')
      .select('id, client_id, title, status, scheduled_date, posted_at, abrechnungsmonat')
      .is('deleted_at', null),
  ])
  const fehler = k.error?.message ?? e.error?.message ?? v.error?.message ?? null
  return {
    fehler,
    kunden: (k.data ?? []) as KundeFuerMonat[],
    eintraege: ((e.data ?? []) as any[]).map((r) => ({ ...r, quota: Number(r.quota), betrag: r.betrag == null ? null : Number(r.betrag) })) as MonatsEintrag[],
    videos: (v.data ?? []) as MonatsVideo[],
  }
}

export async function speichereEintrag(e: Omit<MonatsEintrag, 'id'>): Promise<string | null> {
  const { error } = await supabase.from('client_month_plans').upsert(
    {
      client_id: e.client_id, month_key: e.month_key, quota: e.quota, betrag: e.betrag, status: e.status, notiz: e.notiz,
      zahlung_monat: e.zahlung_monat ?? null, dabei: e.dabei ?? true,
    },
    { onConflict: 'client_id,month_key' },
  )
  return error ? error.message : null
}

/** Eintrag entfernen = zurueck zum Vorschlag (bzw. leer in der Vergangenheit). */
export async function entferneEintrag(clientId: string, key: string): Promise<string | null> {
  const { error } = await supabase.from('client_month_plans').delete().eq('client_id', clientId).eq('month_key', key)
  return error ? error.message : null
}

/** Alle Zeilen eines Monats auf einen Stand setzen -- Vorschlaege werden dabei zu Eintraegen. */
export async function monatSetzen(key: string, zeilen: MonatsZeile[], status: MonatStatus): Promise<string | null> {
  const rows = zeilen
    .filter((z) => z.herkunft === 'eintrag' || z.soll > 0 || z.betrag > 0)
    .map((z) => ({
      client_id: z.kunde.id, month_key: key, quota: z.soll, betrag: z.betrag,
      // "unsicher" bleibt beim Festmachen erhalten -- ein Fragezeichen
      // verschwindet nicht durch einen Sammelknopf. Beim Abschliessen schon.
      status: status === 'fest' && z.status === 'unsicher' ? 'unsicher' as MonatStatus : status,
      notiz: z.eintrag?.notiz ?? null,
      zahlung_monat: z.eintrag?.zahlung_monat ?? null, dabei: !z.nichtDabei,
    }))
  if (!rows.length) return null
  const { error } = await supabase.from('client_month_plans').upsert(rows, { onConflict: 'client_id,month_key' })
  return error ? error.message : null
}

/** Video einem anderen Monat zurechnen (null = wieder nach Posting-Tag). */
export async function videoMonatSetzen(videoId: string, key: string | null): Promise<string | null> {
  const { error } = await supabase.from('videos').update({ abrechnungsmonat: key }).eq('id', videoId)
  return error ? error.message : null
}
