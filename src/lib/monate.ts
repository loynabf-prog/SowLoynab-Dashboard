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
  /** Ist das Geld da? (0048) */
  zahlstatus?: Zahlstatus
  bezahlt_am?: string | null
}

export type Zahlstatus = 'offen' | 'rechnung' | 'bezahlt'

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
  scheduled_time?: string | null
  posted_at: string | null
  abrechnungsmonat?: string | null
  tiktok_url?: string | null
  instagram_url?: string | null
  link_fetch_state?: string | null
  geprueft_am?: string | null
}

export interface MonatsDrehtag {
  id: string
  title: string
  starts_on: string
  client_id: string | null
  planned_videos: number | null
}

export interface MonatsAufgabe {
  id: string
  title: string
  due_date: string | null
  done: boolean
  client_id: string | null
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

/**
 * In welchem Monat ist ein Video? Seit 20.10.2026 getrennt vom Geld:
 * gepostet -> Monat, in dem es rausging; sonst Monat des Posting-Tags.
 * (videos.abrechnungsmonat wird nicht mehr benutzt.)
 */
export function zuordnungsMonat(v: MonatsVideo): string | null {
  if (v.status === 'posted' && v.posted_at) return berlinMonat(v.posted_at)
  if (v.scheduled_date) return v.scheduled_date.slice(0, 7)
  if (v.posted_at) return berlinMonat(v.posted_at)
  return null
}

/** Monat eines Zeitstempels in deutscher Zeit (Post um 0:30 am 1. zaehlt zum neuen Monat). */
function berlinMonat(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts.slice(0, 7)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7)
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
  bezahlt: number       // Geld ist da
  rechnung: number      // Rechnung ist raus, Geld noch nicht
}

export function monatsSumme(zeilen: MonatsZeile[]): MonatsSumme {
  const s: MonatsSumme = { fest: 0, geplant: 0, unsicher: 0, vorschlag: 0, videosSoll: 0, videosAngelegt: 0, videosGepostet: 0, kunden: 0, bezahlt: 0, rechnung: 0 }
  for (const z of zeilen) {
    if (z.nichtDabei) continue
    if (z.status === 'fest' || z.status === 'abgeschlossen') s.fest += z.betrag
    else if (z.status === 'geplant') s.geplant += z.betrag
    else if (z.status === 'unsicher') s.unsicher += z.betrag
    else s.vorschlag += z.betrag
    const zs = z.eintrag?.zahlstatus
    if (zs === 'bezahlt') s.bezahlt += z.betrag
    else if (zs === 'rechnung') s.rechnung += z.betrag
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
  const [k, e, v, d, t] = await Promise.all([
    supabase.from('clients')
      .select('id, name, logo_url, monthly_quota, monthly_fee, active, client_type, pausiert_seit')
      .is('deleted_at', null).order('name'),
    supabase.from('client_month_plans')
      .select('id, client_id, month_key, quota, betrag, status, notiz, zahlung_monat, dabei, zahlstatus, bezahlt_am')
      .gte('month_key', von).lte('month_key', bis),
    supabase.from('videos')
      .select('id, client_id, title, status, scheduled_date, scheduled_time, posted_at, abrechnungsmonat, tiktok_url, instagram_url, link_fetch_state, geprueft_am')
      .is('deleted_at', null),
    supabase.from('events')
      .select('id, title, starts_on, client_id, planned_videos')
      .eq('kind', 'dreh').is('deleted_at', null)
      .gte('starts_on', von + '-01').lte('starts_on', monatPlus(bis, 1) + '-01'),
    supabase.from('tasks')
      .select('id, title, due_date, done, client_id')
      .is('deleted_at', null).eq('done', false)
      .gte('due_date', von + '-01').lt('due_date', monatPlus(bis, 1) + '-01'),
  ])
  const fehler = k.error?.message ?? e.error?.message ?? v.error?.message ?? null
  return {
    fehler,
    kunden: (k.data ?? []) as KundeFuerMonat[],
    eintraege: ((e.data ?? []) as any[]).map((r) => ({ ...r, quota: Number(r.quota), betrag: r.betrag == null ? null : Number(r.betrag) })) as MonatsEintrag[],
    videos: (v.data ?? []) as MonatsVideo[],
    drehtage: (d.data ?? []) as MonatsDrehtag[],
    aufgaben: (t.data ?? []) as MonatsAufgabe[],
  }
}

export async function speichereEintrag(e: Omit<MonatsEintrag, 'id'>): Promise<string | null> {
  const { error } = await supabase.from('client_month_plans').upsert(
    {
      client_id: e.client_id, month_key: e.month_key, quota: e.quota, betrag: e.betrag, status: e.status, notiz: e.notiz,
      zahlung_monat: e.zahlung_monat ?? null, dabei: e.dabei ?? true,
      zahlstatus: e.zahlstatus ?? 'offen',
      bezahlt_am: e.zahlstatus === 'bezahlt' ? (e.bezahlt_am ?? new Date().toISOString().slice(0, 10)) : null,
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
      zahlstatus: z.eintrag?.zahlstatus ?? 'offen', bezahlt_am: z.eintrag?.bezahlt_am ?? null,
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

// ------------------------------------------------------------ To-dos
export type TodoArt = 'anlegen' | 'drehtag' | 'zahlung' | 'klaeren' | 'aufgabe'

export interface MonatsTodo {
  key: string
  art: TodoArt
  text: string
  unter?: string
  client_id?: string | null
}

/**
 * Was muss fuer diesen Monat noch passieren, damit wir alles einhalten?
 * Bewusst ohne Ampel -- eine ruhige Liste, kein Alarm.
 */
export function monatsTodos(
  key: string,
  zeilen: MonatsZeile[],
  drehtage: MonatsDrehtag[],
  aufgaben: MonatsAufgabe[],
  vz: VideoZeile[] = [],
): MonatsTodo[] {
  const out: MonatsTodo[] = []
  const dabei = zeilen.filter((z) => !z.nichtDabei && z.herkunft === 'eintrag')
  for (const v of vz) {
    const da = v.gepostet.length + v.geplant.length
    const fehlt = Math.max(0, v.ziel - da)
    if (fehlt > 0) {
      out.push({ key: 'a' + v.kunde.id, art: 'anlegen', client_id: v.kunde.id,
        text: `${v.kunde.name}: ${fehlt} ${fehlt === 1 ? 'Video' : 'Videos'} anlegen`,
        unter: `${da} von ${v.ziel} sind gepostet oder haben einen Posting-Tag` })
    }
  }
  for (const v of vz) {
    if (v.ziel <= 0) continue
    const z = { kunde: v.kunde }
    const hat = drehtage.some((d) => d.client_id === z.kunde.id && (d.starts_on.slice(0, 7) === key || d.starts_on.slice(0, 7) === monatPlus(key, -1)))
    if (!hat) {
      out.push({ key: 'd' + z.kunde.id, art: 'drehtag', client_id: z.kunde.id,
        text: `${z.kunde.name}: Drehtag eintragen`, unter: `noch keiner im ${monatName(monatPlus(key, -1), true)} oder ${monatName(key, true)}` })
    }
  }
  for (const z of dabei) {
    if (z.status === 'unsicher') {
      out.push({ key: 'k' + z.kunde.id, art: 'klaeren', client_id: z.kunde.id,
        text: `${z.kunde.name} klären`, unter: z.eintrag?.notiz ?? 'steht unter Vorbehalt' })
    }
  }
  for (const z of dabei) {
    if (z.betrag > 0 && (z.eintrag?.zahlstatus ?? 'offen') === 'offen') {
      out.push({ key: 'z' + z.kunde.id, art: 'zahlung', client_id: z.kunde.id,
        text: `Rechnung an ${z.kunde.name}: ${euro(z.betrag)}`,
        unter: z.eintrag?.zahlung_monat && z.eintrag.zahlung_monat !== key ? `Geld kommt erst im ${monatName(z.eintrag.zahlung_monat, true)}` : 'noch nicht gestellt' })
    }
  }
  for (const a of aufgaben) {
    if (!a.due_date || a.due_date.slice(0, 7) !== key) continue
    out.push({ key: 't' + a.id, art: 'aufgabe', client_id: a.client_id, text: a.title,
      unter: new Date(a.due_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) })
  }
  return out
}

// ------------------------------------------------------------ Kalender
export interface KalenderTag {
  datum: string          // YYYY-MM-DD
  imMonat: boolean
  posts: MonatsVideo[]
  drehtage: MonatsDrehtag[]
}

/** Wochen des Monats (Mo-So) mit Posts und Drehtagen je Tag. */
export function monatsKalender(key: string, videos: MonatsVideo[], drehtage: MonatsDrehtag[]): KalenderTag[][] {
  const [j, m] = key.split('-').map(Number)
  const erster = new Date(j, m - 1, 1)
  const start = new Date(erster)
  start.setDate(1 - ((erster.getDay() + 6) % 7))
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const wochen: KalenderTag[][] = []
  const d = new Date(start)
  while (true) {
    const woche: KalenderTag[] = []
    for (let i = 0; i < 7; i++) {
      const t = iso(d)
      woche.push({
        datum: t, imMonat: t.slice(0, 7) === key,
        posts: videos.filter((v) => v.scheduled_date === t),
        drehtage: drehtage.filter((x) => x.starts_on === t),
      })
      d.setDate(d.getDate() + 1)
    }
    wochen.push(woche)
    if (iso(d).slice(0, 7) !== key) break
  }
  return wochen
}

export async function drehtagEintragen(clientId: string, name: string, datum: string, videos: number | null): Promise<string | null> {
  const { error } = await supabase.from('events').insert({
    title: `Drehtag ${name}`, kind: 'dreh', starts_on: datum, client_id: clientId, planned_videos: videos,
  })
  return error ? error.message : null
}

// ------------------------------------------------------------ Videos (getrennt vom Geld)
export interface VideoZeile {
  kunde: KundeFuerMonat
  /** Vorhaben fuer den Monat: Eintrag, sonst Retainer (nur aktuelle/kommende Monate). */
  ziel: number
  zielHerkunft: 'eintrag' | 'retainer' | 'keins'
  eintrag: MonatsEintrag | null
  gepostet: MonatsVideo[]
  geplant: MonatsVideo[]
}

/**
 * Videos je Kunde in einem Monat -- gezaehlt aus den echten Videos, nicht
 * aus dem Geld. Ein Ehrenamt ohne Betrag steht hier ganz normal drin.
 */
export function videoZeilen(
  key: string, heuteKey: string, kunden: KundeFuerMonat[], eintraege: MonatsEintrag[], videos: MonatsVideo[],
): VideoZeile[] {
  const ein = new Map(eintraege.filter((e) => e.month_key === key).map((e) => [e.client_id, e]))
  const zu = istAbgeschlossen(eintraege, key)
  const out: VideoZeile[] = []
  for (const k of kunden) {
    const vids = videos.filter((v) => v.client_id === k.id && zuordnungsMonat(v) === key)
    const gepostet = vids.filter((v) => v.status === 'posted')
    const geplant = vids.filter((v) => v.status !== 'posted')
    const e = ein.get(k.id) ?? null
    let ziel = 0
    let zielHerkunft: VideoZeile['zielHerkunft'] = 'keins'
    if (e && e.dabei !== false) { ziel = e.quota; zielHerkunft = 'eintrag' }
    else if (!e && key >= heuteKey && !zu && k.active !== false && (k.monthly_quota ?? 0) > 0 && !k.pausiert_seit) {
      ziel = k.monthly_quota ?? 0; zielHerkunft = 'retainer'
    }
    if (ziel > 0 || vids.length > 0) out.push({ kunde: k, ziel, zielHerkunft, eintrag: e, gepostet, geplant })
  }
  return out.sort((a, b) => (b.ziel - a.ziel) || (b.gepostet.length - a.gepostet.length) || a.kunde.name.localeCompare(b.kunde.name))
}

export function videoSumme(z: VideoZeile[]) {
  return {
    gepostet: z.reduce((s, x) => s + x.gepostet.length, 0),
    geplant: z.reduce((s, x) => s + x.geplant.length, 0),
    ziel: z.reduce((s, x) => s + x.ziel, 0),
  }
}

/** Geld-Liste: nur Kunden, bei denen es um Geld geht (kein Ehrenamt mit 0 EUR). */
export function geldZeilen(zeilen: MonatsZeile[]): MonatsZeile[] {
  return zeilen.filter((z) => {
    if (z.nichtDabei) return false
    if (z.herkunft === 'vorschlag') return z.betrag > 0
    if (z.eintrag?.betrag == null) return (z.kunde.client_type ?? 'zahlend') === 'zahlend' // Betrag fehlt noch
    return z.betrag > 0
  })
}

// ------------------------------------------------------------ Monats-Check
export type CheckProblem = 'verpasst' | 'link_fehlt' | 'ungeprueft' | 'ok'

export interface CheckVideo { video: MonatsVideo; problem: CheckProblem; fehlt: ('tiktok' | 'instagram')[] }
export interface CheckKunde { kunde: KundeFuerMonat; videos: CheckVideo[]; offen: number }

/**
 * Nachkontrolle eines Monats: alle Videos je Kunde, das Problematischste
 * zuerst. Ein Video ist "ok", wenn es gepostet ist, alle Links seiner
 * Plattformen hat und abgehakt wurde.
 */
export function monatsCheck(
  key: string, heute: string, kunden: KundeFuerMonat[], videos: MonatsVideo[],
  plattformenVon: (clientId: string) => ('tiktok' | 'instagram')[],
): CheckKunde[] {
  const rang: Record<CheckProblem, number> = { verpasst: 0, link_fehlt: 1, ungeprueft: 2, ok: 3 }
  const out: CheckKunde[] = []
  for (const k of kunden) {
    const vids = videos.filter((v) => v.client_id === k.id && zuordnungsMonat(v) === key)
    if (!vids.length) continue
    const pl = plattformenVon(k.id)
    const cv: CheckVideo[] = vids.map((v): CheckVideo => {
      if (v.status !== 'posted') {
        const vorbei = !!v.scheduled_date && v.scheduled_date < heute
        return { video: v, problem: (vorbei ? 'verpasst' : 'ungeprueft') as CheckProblem, fehlt: [] }
      }
      const fehlt = pl.filter((p) => !((p === 'tiktok' ? v.tiktok_url : v.instagram_url) ?? '').trim())
      if (fehlt.length) return { video: v, problem: 'link_fehlt', fehlt }
      return { video: v, problem: (v.geprueft_am ? 'ok' : 'ungeprueft') as CheckProblem, fehlt: [] }
    }).sort((a, b) => rang[a.problem] - rang[b.problem] || (a.video.scheduled_date ?? '').localeCompare(b.video.scheduled_date ?? ''))
    out.push({ kunde: k, videos: cv, offen: cv.filter((x) => x.problem !== 'ok').length })
  }
  return out.sort((a, b) => b.offen - a.offen || a.kunde.name.localeCompare(b.kunde.name))
}

export async function videoGeprueft(id: string, ja: boolean): Promise<string | null> {
  const { error } = await supabase.from('videos').update({ geprueft_am: ja ? new Date().toISOString() : null }).eq('id', id)
  return error ? error.message : null
}

export async function ladeAccountsAlle(): Promise<{ client_id: string; platform: string; handle: string }[]> {
  const { data } = await supabase.from('client_accounts').select('client_id, platform, handle')
  return (data ?? []) as { client_id: string; platform: string; handle: string }[]
}
