// Was der Pilot TUT, wenn man auf seinen Knopf tippt.
// ---------------------------------------------------------------------------
// pilot.ts sagt, was dran ist. Diese Datei fuehrt es aus -- mit genau einem
// Tipp, ohne Formular:
//
//   einplanen     fertige Videos eines Kunden auf freie Tage verteilen, zur
//                 Uhrzeit, die bei diesem Kunden am besten lief
//   mehrDavon     aus einem Video, das doppelt so gut lief, eine neue Idee
//
// Dazu ladePilot(): holt die Sicht pilot_kunden und rechnet die Erfolge.

import { supabase } from './supabase'
import { heute as heuteIso, datumPlus } from './datum'
import { median } from './analyse'
import { pilot, tageImMonat, type Erfolg, type Pilot, type PilotKunde } from './pilot'

/** Die Uhrzeit, wenn wir nichts Besseres wissen. */
export const STANDARD_ZEIT = '18:00'

/**
 * Freie Tage ab `ab`, gleichmaessig ueber ein Fenster verteilt. Tage, an
 * denen der Kunde schon postet, bleiben frei -- sonst haeuft es sich.
 * Reichen die freien Tage nicht, wird ein Tag doppelt belegt, lieber als
 * gar nicht eingeplant.
 */
export function verteileTage(ab: string, anzahl: number, belegt: string[], fenster: number): string[] {
  if (anzahl <= 0) return []
  const b = new Set(belegt)
  const frei: string[] = []
  for (let i = 0; i < Math.max(fenster, anzahl); i++) {
    const d = datumPlus(ab, i)
    if (!b.has(d)) frei.push(d)
  }
  if (frei.length === 0) return Array.from({ length: anzahl }, (_, i) => datumPlus(ab, i))
  const aus: string[] = []
  for (let i = 0; i < anzahl; i++) {
    const pos = frei.length >= anzahl
      ? Math.round((i * (frei.length - 1)) / Math.max(1, anzahl - 1))
      : i % frei.length
    aus.push(frei[Math.min(pos, frei.length - 1)])
  }
  return aus
}

/**
 * Beste Uhrzeit eines Kunden: die Stunde, in der seine drei besten Videos
 * (nach Views) gepostet wurden -- gerundet auf volle Stunde. Weniger als
 * drei Videos mit Zahlen: Standard.
 */
export function besteUhrzeit(videos: { views: number | null; posted_at: string | null; scheduled_time?: string | null }[]): string {
  const mit = videos.filter((v) => v.views != null && v.posted_at).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 3)
  if (mit.length < 3) return STANDARD_ZEIT
  const stunden = mit.map((v) => Number(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(new Date(v.posted_at!))))
  const m = Math.round(median(stunden) ?? 18)
  return `${String(Math.min(23, Math.max(6, m))).padStart(2, '0')}:00`
}

export interface EinplanErgebnis { anzahl: number; tage: string[]; zeit: string; fehler: string | null }

/** Fertige Videos eines Kunden ohne Posting-Tag einplanen. */
export async function einplanen(clientId: string): Promise<EinplanErgebnis> {
  const heute = heuteIso()
  const [{ data: offen, error }, { data: belegte }, { data: gepostet }] = await Promise.all([
    supabase.from('videos').select('id, title, status, scheduled_date, produktion_stufe')
      .eq('client_id', clientId).is('deleted_at', null).neq('status', 'posted')
      .or(`status.in.(ready,planned),produktion_stufe.eq.fertig`),
    supabase.from('videos').select('scheduled_date').eq('client_id', clientId).is('deleted_at', null)
      .gte('scheduled_date', heute),
    supabase.from('videos').select('views, posted_at').eq('client_id', clientId).eq('status', 'posted').is('deleted_at', null)
      .not('views', 'is', null).order('views', { ascending: false }).limit(10),
  ])
  if (error) return { anzahl: 0, tage: [], zeit: STANDARD_ZEIT, fehler: error.message }
  const videos = ((offen ?? []) as { id: string; scheduled_date: string | null }[])
    .filter((v) => !v.scheduled_date || v.scheduled_date < heute)
  if (videos.length === 0) return { anzahl: 0, tage: [], zeit: STANDARD_ZEIT, fehler: null }

  // Fenster: bis Monatsende, mindestens eine Woche -- damit das Monatsziel
  // auch wirklich in diesem Monat landet.
  const tage = tageImMonat(heute.slice(0, 7))
  const restTage = tage - Number(heute.slice(8, 10))
  const fenster = Math.max(7, restTage)
  const belegt = ((belegte ?? []) as { scheduled_date: string | null }[]).map((x) => x.scheduled_date!).filter(Boolean)
  const termine = verteileTage(datumPlus(heute, 1), videos.length, belegt, fenster)
  const zeit = besteUhrzeit((gepostet ?? []) as { views: number | null; posted_at: string | null }[])

  for (let i = 0; i < videos.length; i++) {
    const { error: e } = await supabase.from('videos').update({
      scheduled_date: termine[i], scheduled_time: zeit, status: 'planned',
      prep_shot: true, prep_edited: true, prep_scheduled: true,
    }).eq('id', videos[i].id)
    if (e) return { anzahl: i, tage: termine.slice(0, i), zeit, fehler: e.message }
  }
  window.dispatchEvent(new Event('daten-geaendert'))
  return { anzahl: videos.length, tage: termine, zeit, fehler: null }
}

/** Aus einem Erfolg eine Idee machen. */
export async function mehrDavon(er: Erfolg, userId?: string | null): Promise<string | null> {
  const { error } = await supabase.from('video_ideas').insert({
    client_id: er.client_id,
    title: `Mehr davon: ${er.title}`,
    notes: `Lief ${er.faktor.toFixed(1).replace('.', ',')}× besser als der typische Post dieses Kunden. Gleiches Format, gleicher Dreh — Fortsetzung oder zweiter Teil.`,
    source: 'ai', created_by: userId ?? null,
  })
  if (!error) window.dispatchEvent(new Event('daten-geaendert'))
  return error ? error.message : null
}

/** Erfolge: Videos der letzten 14 Tage, gemessen am Median der letzten 90 Tage je Kunde. */
export function erfolgeAus(videos: { id: string; client_id: string; title: string; views: number | null; posted_at: string | null }[], jetzt = new Date()): Erfolg[] {
  const vor14 = new Date(jetzt.getTime() - 14 * 86_400_000).toISOString()
  const proKunde = new Map<string, number[]>()
  for (const v of videos) {
    if (v.views == null) continue
    const l = proKunde.get(v.client_id) ?? []
    l.push(v.views)
    proKunde.set(v.client_id, l)
  }
  const aus: Erfolg[] = []
  for (const v of videos) {
    if (v.views == null || !v.posted_at || v.posted_at < vor14) continue
    const l = proKunde.get(v.client_id) ?? []
    if (l.length < 5) continue
    const m = median(l)
    if (!m) continue
    aus.push({ client_id: v.client_id, video_id: v.id, title: v.title, faktor: v.views / m })
  }
  return aus.sort((a, b) => b.faktor - a.faktor).slice(0, 5)
}

/** Alles laden und rechnen. */
export async function ladePilot(): Promise<Pilot & { fehler: string | null }> {
  const vor90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [{ data: kunden, error }, { data: videos }] = await Promise.all([
    supabase.from('pilot_kunden').select('*'),
    supabase.from('videos').select('id, client_id, title, views, posted_at')
      .eq('status', 'posted').is('deleted_at', null).gte('posted_at', vor90),
  ])
  if (error) return { lagen: [], empfehlungen: [], fehler: error.message }
  const zeilen = ((kunden ?? []) as Record<string, unknown>[]).map((r) => {
    const k = { ...r } as Record<string, unknown>
    for (const f of ['ziel', 'ziel_naechster', 'gepostet', 'offen_monat', 'gepostet_7t', 'eingeplant', 'fertig_ohne_termin', 'im_ofen', 'zettel', 'raus', 'belegt', 'teig', 'ideen', 'links_fehlen', 'zahlen_alt', 'drehtag_videos', 'vormonat_quota']) {
      k[f] = k[f] == null ? (f === 'vormonat_quota' ? null : 0) : Number(k[f])
    }
    return k as unknown as PilotKunde
  })
  const p = pilot({ kunden: zeilen, erfolge: erfolgeAus((videos ?? []) as never), heute: heuteIso() })
  return { ...p, fehler: null }
}
