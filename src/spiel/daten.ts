// Laden fuer das Spiel: dieselben Tabellen wie das CRM, ein Rutsch.

import { supabase } from '../lib/supabase'
import { heute as heuteIso } from '../lib/datum'
import { ladePilot } from '../lib/pilotAktionen'
import type { Empfehlung, PilotKunde } from '../lib/pilot'
import { XP, beuteJetzt, ladenStufe, spielStand, type SKunde, type SpielStand, type SQuest, type SZiel, type ZielTyp } from '../lib/spiel'
import { schnellGepostet } from '../lib/videoAktionen'

/** Was im Studio gerade "lebt": Ofen an, Zettel am Brett, Kunden an der Wand. */
/** Ein Kunde, wie er im Studio steht: Figur in seiner Farbe, mit Monatsstand. */
export interface StudioKunde {
  id: string; name: string; farbe: string | null; logo: string | null; gruen: boolean
  gepostet: number; ziel: number
  /** rot = braucht euch jetzt, gelb = bald, gruen = laeuft */
  ampel: 'rot' | 'gelb' | 'gruen'
  satz: string
  /** alle je geposteten Videos fuer diesen Kunden -- daran waechst sein Laden */
  videosGesamt: number
  stufe: number
  /** ab wie vielen Videos die naechste Stufe kommt (null = ausgebaut) */
  stufeNaechste: number | null
}

/** Woher die Agentur kommt: erstes Video, Kunden in der Reihenfolge, in der sie dazukamen. */
export interface Geschichte {
  erstesVideo: string | null
  kunden: { name: string; seit: string; videos: number }[]
  videos: number
  views: number
}

export interface StudioLeben {
  imOfen: number
  fertig: number
  kunden: StudioKunde[]
  vorschlaege: number
  dringend: number
  dokumente: number
}

export interface SpielDaten {
  stand: SpielStand
  leben: StudioLeben
  auftraege: Empfehlung[]
  /** Alle aktiven Kunden inkl. eigenem Account -- fuer "Video gepostet" */
  postbar: { id: string; name: string; eigen: boolean }[]
  /** XP je Quelle: verdient (jetzt) und schon eingesammelt */
  beuteJetzt: Record<string, number>
  beuteGesammelt: Record<string, number>
  /** heute gepostete Videos (alle Kunden + eigener Account) */
  heuteVideos: number
  /** Der Weg bis hierher -- fuer die Einfuehrung */
  geschichte: Geschichte
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
  const [k, v, ko, pl, q, d, pilot, zi, follower, bt] = await Promise.all([
    supabase.from('clients').select('id, name, client_type, monthly_fee, monthly_quota, active, pausiert_seit, logo_url, brand_color').is('deleted_at', null),
    supabase.from('videos').select('id, client_id, title, posted_at, views, scheduled_date').eq('status', 'posted').is('deleted_at', null),
    supabase.from('monats_kontrollen').select('client_id, month_key, geprueft_bis'),
    supabase.from('client_month_plans').select('client_id, month_key, zahlstatus, betrag, quota, status, dabei'),
    supabase.from('quests').select('*').is('deleted_at', null).order('sort'),
    supabase.from('dokumente').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    ladePilot(),
    supabase.from('spiel_ziele').select('id, titel, belohnung, typ, wert, datum, schluessel, eingeloest_am, sort').is('deleted_at', null).order('sort'),
    ladeFollower(),
    supabase.from('spiel_beute').select('quellen').eq('id', 1).maybeSingle(),
  ])
  const fehler = k.error ?? v.error ?? ko.error ?? pl.error ?? q.error
  if (fehler) throw fehler
  const kunden = (k.data ?? []) as SKunde[]
  const stand = spielStand({
    kunden, videos: (v.data ?? []) as never, kontrollen: (ko.data ?? []) as never, plaene: (pl.data ?? []) as never,
    quests: (q.data ?? []) as SQuest[], heute,
    // Tabelle fehlt (Migration 0076 noch nicht da)? Dann ohne Ziele weiter.
    ziele: zi.error ? [] : ((zi.data ?? []) as SZiel[]), follower,
  })
  // Videos je Kunde (so wie spielStand zaehlt: nur mit posted_at)
  const alleVideos = ((v.data ?? []) as { client_id: string; posted_at: string | null }[]).filter((x) => x.posted_at)
  const videosJeKunde: Record<string, number> = {}
  for (const x of alleVideos) videosJeKunde[x.client_id] = (videosJeKunde[x.client_id] ?? 0) + 1
  const tagVon = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const heuteVideos = alleVideos.filter((x) => tagVon(x.posted_at!) === heute).length
  const eigenIds = kunden.filter((x) => x.client_type === 'eigen').map((x) => x.id)
  const jetzt = beuteJetzt(stand, videosJeKunde, eigenIds)
  let gesammelt: Record<string, number>
  if (bt.error) gesammelt = jetzt // Tabelle fehlt noch: nichts zum Einsammeln, alles zaehlt direkt
  else if (bt.data) gesammelt = (bt.data.quellen ?? {}) as Record<string, number>
  else {
    // Erster Start: alles Bisherige gilt als eingesammelt -- bis auf die Videos der letzten drei Tage,
    // damit gleich etwas im Dorf liegt.
    gesammelt = { ...jetzt }
    const grenze = new Date(Date.now() - 3 * 86_400_000).toISOString()
    for (const x of alleVideos) {
      if (x.posted_at! < grenze || eigenIds.includes(x.client_id)) continue
      const key = `kunde:${x.client_id}`
      gesammelt[key] = Math.max(0, (gesammelt[key] ?? 0) - XP.video)
    }
    await supabase.from('spiel_beute').upsert({ id: 1, quellen: gesammelt, updated_at: new Date().toISOString() })
  }
  const erstes: Record<string, string> = {}
  for (const x of alleVideos) if (!erstes[x.client_id] || x.posted_at! < erstes[x.client_id]) erstes[x.client_id] = x.posted_at!
  const geschichte: Geschichte = {
    erstesVideo: Object.values(erstes).sort()[0] ?? null,
    kunden: kunden.filter((x) => x.client_type !== 'eigen' && erstes[x.id])
      .map((x) => ({ name: x.name, seit: erstes[x.id], videos: videosJeKunde[x.id] ?? 0 }))
      .sort((a, b) => a.seit.localeCompare(b.seit)),
    videos: alleVideos.length,
    views: ((v.data ?? []) as { views: number | null }[]).reduce((a, x) => a + Number(x.views ?? 0), 0),
  }
  const lage = new Map(pilot.lagen.map((l) => [l.kunde.client_id, l]))
  let imOfen = 0, fertig = 0
  for (const l of pilot.lagen) { const pk: PilotKunde = l.kunde; imOfen += (pk.im_ofen ?? 0) + (pk.zettel ?? 0); fertig += pk.raus ?? 0 }
  const leben: StudioLeben = {
    imOfen, fertig,
    kunden: kunden
      .filter((x) => x.active && x.client_type !== 'passiv' && x.client_type !== 'eigen')
      .sort((a, b) => Number(!!a.pausiert_seit) - Number(!!b.pausiert_seit) || Number(b.monthly_fee ?? 0) - Number(a.monthly_fee ?? 0))
      .map((x) => {
        const l = lage.get(x.id)
        const ampel: StudioKunde['ampel'] = l?.ampel === 'rot' ? 'rot' : l?.ampel === 'gelb' ? 'gelb' : 'gruen'
        return { id: x.id, name: x.name, farbe: x.brand_color, logo: x.logo_url, gruen: !!l?.gruen, gepostet: l?.kunde.gepostet ?? 0, ziel: l?.kunde.ziel ?? 0, ampel, satz: l?.satz ?? '', videosGesamt: videosJeKunde[x.id] ?? 0, stufe: ladenStufe(videosJeKunde[x.id] ?? 0).stufe, stufeNaechste: ladenStufe(videosJeKunde[x.id] ?? 0).naechste }
      }),
    vorschlaege: pilot.empfehlungen.filter((e) => e.art !== 'ideen').length,
    dringend: pilot.empfehlungen.filter((e) => e.ampel === 'rot').length,
    dokumente: d.count ?? 0,
  }
  const postbar = kunden
    .filter((x) => x.active && x.client_type !== 'passiv' && !x.pausiert_seit)
    .sort((a, b) => Number(a.client_type === 'eigen') - Number(b.client_type === 'eigen') || a.name.localeCompare(b.name, 'de'))
    .map((x) => ({ id: x.id, name: x.name, eigen: x.client_type === 'eigen' }))
  return { stand, leben, auftraege: pilot.empfehlungen, postbar, beuteJetzt: jetzt, beuteGesammelt: gesammelt, heuteVideos, geschichte, heute }
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
    ab_level: q.ab_level ?? 0, sort: Math.round(Date.now() / 1000), created_by: q.userId ?? null,
  })
  if (error) throw error
}

export async function questLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from('quests').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------- Follower
// Personal Brand = die Accounts des eigenen Kunden, deren Handle in der
// Kundenakte steht (@sowloynab) -- nicht die privaten Creator-Accounts, die
// am selben Kunden haengen. Je Account der letzte bekannte Stand.
async function ladeFollower(): Promise<{ tiktok: number; instagram: number }> {
  const leer = { tiktok: 0, instagram: 0 }
  try {
    const { data: eigen } = await supabase.from('clients').select('id, handle_ig, handle_tiktok').eq('client_type', 'eigen').is('deleted_at', null).limit(1)
    const c = (eigen ?? [])[0] as { id: string; handle_ig: string | null; handle_tiktok: string | null } | undefined
    if (!c) return leer
    const { data: acc } = await supabase.from('client_accounts').select('id, platform, handle').eq('client_id', c.id)
    const sauber = (h: string | null | undefined) => (h ?? '').replace(/^@/, '').trim().toLowerCase()
    const meine = ((acc ?? []) as { id: string; platform: string; handle: string | null }[]).filter((a) =>
      a.platform === 'tiktok' ? sauber(a.handle) === sauber(c.handle_tiktok) && !!c.handle_tiktok
        : a.platform === 'instagram' ? sauber(a.handle) === sauber(c.handle_ig) && !!c.handle_ig : false)
    if (!meine.length) return leer
    const { data: st } = await supabase.from('client_stats')
      .select('account_id, captured_on, followers_ig, followers_tiktok')
      .in('account_id', meine.map((a) => a.id)).order('captured_on', { ascending: false }).limit(200)
    const aus = { ...leer }
    const gesehen = new Set<string>()
    for (const r of (st ?? []) as { account_id: string; followers_ig: number | null; followers_tiktok: number | null }[]) {
      const a = meine.find((x) => x.id === r.account_id)
      if (!a) continue
      const wert = a.platform === 'tiktok' ? r.followers_tiktok : r.followers_ig
      if (wert == null || gesehen.has(a.id)) continue
      gesehen.add(a.id)
      if (a.platform === 'tiktok') aus.tiktok += wert; else aus.instagram += wert
    }
    return aus
  } catch { return leer }
}

// ---------------------------------------------------------------- Ziele
export async function zielAnlegen(z: { titel: string; belohnung?: string; typ: ZielTyp; wert?: number | null; datum?: string | null }): Promise<void> {
  const { error } = await supabase.from('spiel_ziele').insert({
    titel: z.titel.trim(), belohnung: z.belohnung?.trim() || null, typ: z.typ,
    wert: z.typ === 'datum' ? null : z.wert ?? null, datum: z.typ === 'datum' ? z.datum || null : null, sort: Math.round(Date.now() / 1000),
  })
  if (error) throw error
}

export async function zielEinloesen(id: string, zurueck = false): Promise<void> {
  const { error } = await supabase.from('spiel_ziele').update({ eingeloest_am: zurueck ? null : new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function zielLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from('spiel_ziele').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ------------------------------------------------- Eingaben -> echtes CRM
// Alles, was im Spiel eingetragen wird, landet in denselben Tabellen wie im
// CRM -- auf demselben Weg wie dort (schnellGepostet fuellt Platzhalter,
// holt Link und Zahlen).

/** "Video gepostet": gibt eine Fehlermeldung zurueck oder null. */
export function videoGepostet(clientId: string): Promise<string | null> {
  return schnellGepostet(clientId)
}

export async function leadAnlegen(l: { name: string; honorar?: number | null; notiz?: string }): Promise<void> {
  const { error } = await supabase.from('leads').insert({ name: l.name.trim(), potential_fee: l.honorar ?? null, notes: l.notiz?.trim() || null, source: 'Spiel' })
  if (error) throw error
}

export async function kundeAnlegen(k: { name: string; honorar: number | null; videos: number | null; heute: string }): Promise<void> {
  const { error } = await supabase.from('clients').insert({
    name: k.name.trim(), monthly_fee: k.honorar, monthly_quota: k.videos, client_type: 'zahlend', active: true, start_date: k.heute,
  })
  if (error) throw error
}

export async function terminAnlegen(t: { titel: string; tag: string; von?: string | null; bis?: string | null; clientId?: string | null; drehtag: boolean }): Promise<void> {
  const { error } = await supabase.from('events').insert({
    title: t.titel.trim(), kind: t.drehtag ? 'dreh' : 'termin', kategorie: t.clientId ? 'kunde' : null,
    starts_on: t.tag, starts_at: t.von || null, ends_at: t.bis || null, client_id: t.clientId || null,
  })
  if (error) throw error
}

// ---------------------------------------------------------------- Beute
/** Blasen eingesammelt: die neuen Staende je Quelle in die gemeinsame Zeile schreiben. */
export async function beuteSammeln(neu: Record<string, number>): Promise<void> {
  // frisch lesen und mischen -- der andere koennte gerade auch gesammelt haben (hoeherer Stand gewinnt)
  const { data } = await supabase.from('spiel_beute').select('quellen').eq('id', 1).maybeSingle()
  const alt = ((data?.quellen ?? {}) as Record<string, number>)
  const quellen: Record<string, number> = { ...alt }
  for (const [k, w] of Object.entries(neu)) quellen[k] = Math.max(alt[k] ?? 0, w)
  const { error } = await supabase.from('spiel_beute').upsert({ id: 1, quellen, updated_at: new Date().toISOString() })
  if (error) throw error
}
