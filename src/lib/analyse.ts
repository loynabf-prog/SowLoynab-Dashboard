// Auswertung der eigenen Videos: was funktioniert, wann posten, welche Videos
// tragen. Reine Rechenlogik -- die Daten kommen aus der Sicht video_analyse
// (Migration 0044), die Seite ist pages/Analytics.tsx.
//
// Grundidee "Index": Ein Kunde mit 50.000 Followern und einer mit 800 lassen
// sich nicht ueber rohe Views vergleichen. Deshalb wird jedes Video an seinem
// eigenen Kunden gemessen: Index 1,0 = so gut wie der typische Post (Median)
// dieses Kunden, 2,0 = doppelt so gut. Damit kann man ueber alle Kunden
// hinweg fragen "laufen Videos mit Frage in der Caption besser?".

export interface AnalyseVideo {
  id: string
  client_id: string
  title: string | null
  veroeffentlicht: string | null
  wochentag: number | null
  stunde: number | null
  /** false = Uhrzeit ist nur ein Platzhalter (alte, von Hand nachgetragene Videos). */
  zeit_echt: boolean | null
  duration_seconds: number | null
  views: number | null
  views_tiktok: number | null
  views_ig: number | null
  likes: number | null
  comments: number | null
  engagement_rate_tiktok: number | null
  engagement_rate_ig: number | null
  share_rate_tiktok: number | null
  save_rate_tiktok: number | null
  views_pro_follower_tiktok: number | null
  views_pro_follower_ig: number | null
  views_tag1: number | null
  views_tag7: number | null
  views_tag28: number | null
  caption_frage: boolean | null
  caption_laenge: number | null
  hashtag_anzahl: number | null
  tiktok_sound: string | null
  tiktok_sound_original: boolean | null
  ig_sound_original: boolean | null
  ig_type: string | null
  cover: string | null
  tiktok_url: string | null
  instagram_url: string | null
}

/** Ab so vielen Videos je Gruppe sagen wir etwas -- darunter ist es Zufall. */
export const MIN_GRUPPE = 5

/** Postgres-numeric kommt als Text an. */
export function zahl(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v)
  return null
}

const ZAHLFELDER = [
  'wochentag', 'stunde', 'duration_seconds', 'views', 'views_tiktok', 'views_ig', 'likes', 'comments',
  'engagement_rate_tiktok', 'engagement_rate_ig', 'share_rate_tiktok', 'save_rate_tiktok',
  'views_pro_follower_tiktok', 'views_pro_follower_ig', 'views_tag1', 'views_tag7', 'views_tag28',
  'caption_laenge', 'hashtag_anzahl',
] as const

/** Eine Zeile aus video_analyse in saubere Zahlen umwandeln. */
export function normalisiere(r: Record<string, unknown>): AnalyseVideo {
  const v = { ...r } as Record<string, unknown>
  for (const f of ZAHLFELDER) v[f] = zahl(r[f])
  return v as unknown as AnalyseVideo
}

export function median(werte: number[]): number | null {
  const s = werte.filter((x) => isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Index je Video: Views geteilt durch den Median-Post desselben Kunden. */
export function indexJeVideo(videos: AnalyseVideo[]): Map<string, number> {
  const proKunde = new Map<string, number[]>()
  for (const v of videos) {
    if (v.views == null) continue
    const l = proKunde.get(v.client_id) ?? []
    l.push(v.views)
    proKunde.set(v.client_id, l)
  }
  const med = new Map<string, number | null>()
  for (const [k, l] of proKunde) med.set(k, median(l))
  const out = new Map<string, number>()
  for (const v of videos) {
    const m = med.get(v.client_id)
    if (v.views == null || !m) continue
    out.set(v.id, v.views / m)
  }
  return out
}

// ------------------------------------------------------------- Zeitfenster
export const BLOECKE = [
  { key: 'morgen', label: 'Morgens', kurz: '6–11', von: 6, bis: 11 },
  { key: 'mittag', label: 'Mittags', kurz: '11–14', von: 11, bis: 14 },
  { key: 'nachmittag', label: 'Nachmittags', kurz: '14–17', von: 14, bis: 17 },
  { key: 'abend', label: 'Abends', kurz: '17–20', von: 17, bis: 20 },
  { key: 'spaet', label: 'Spätabends', kurz: '20–24', von: 20, bis: 24 },
  { key: 'nacht', label: 'Nachts', kurz: '0–6', von: 0, bis: 6 },
] as const
export type BlockKey = (typeof BLOECKE)[number]['key']

export const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const
export const TAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const

export function blockVon(stunde: number | null): BlockKey | null {
  if (stunde == null) return null
  return BLOECKE.find((b) => stunde >= b.von && stunde < b.bis)?.key ?? null
}

export interface Zelle { n: number; index: number | null }

/** Wochentag x Tageszeit: Median-Index und Anzahl je Feld. */
export function zeitRaster(videos: AnalyseVideo[], idx: Map<string, number>): Record<number, Record<BlockKey, Zelle>> {
  const sammeln: Record<number, Record<string, number[]>> = {}
  for (let t = 1; t <= 7; t++) sammeln[t] = {}
  for (const v of videos) {
    if (v.zeit_echt === false) continue
    const b = blockVon(v.stunde)
    const i = idx.get(v.id)
    if (!b || v.wochentag == null || i == null) continue
    ;(sammeln[v.wochentag][b] ??= []).push(i)
  }
  const out = {} as Record<number, Record<BlockKey, Zelle>>
  for (let t = 1; t <= 7; t++) {
    out[t] = {} as Record<BlockKey, Zelle>
    for (const b of BLOECKE) {
      const l = sammeln[t][b.key] ?? []
      out[t][b.key] = { n: l.length, index: median(l) }
    }
  }
  return out
}

/** Bestes Feld mit genug Videos -- oder null. */
export function besteZeit(raster: Record<number, Record<BlockKey, Zelle>>, minN = 3): { tag: number; block: BlockKey; zelle: Zelle } | null {
  let best: { tag: number; block: BlockKey; zelle: Zelle } | null = null
  for (let t = 1; t <= 7; t++) {
    for (const b of BLOECKE) {
      const z = raster[t][b.key]
      if (z.n < minN || z.index == null) continue
      if (!best || z.index > (best.zelle.index ?? 0)) best = { tag: t, block: b.key, zelle: z }
    }
  }
  return best
}

/** Nur Tageszeit (ueber alle Wochentage) -- trägt schon bei wenigen Videos. */
export function nachTageszeit(videos: AnalyseVideo[], idx: Map<string, number>): { block: BlockKey; n: number; index: number | null }[] {
  return BLOECKE.map((b) => {
    const l = videos.filter((v) => v.zeit_echt !== false && blockVon(v.stunde) === b.key).map((v) => idx.get(v.id)).filter((x): x is number => x != null)
    return { block: b.key, n: l.length, index: median(l) }
  })
}

// --------------------------------------------------------------- Vergleiche
export interface Vergleich {
  key: string
  titel: string
  a: { label: string; n: number; index: number | null }
  b: { label: string; n: number; index: number | null }
  /** Vorteil von a gegenueber b in Prozent, nur wenn beide Gruppen gross genug sind. */
  vorteil: number | null
}

function gruppe(videos: AnalyseVideo[], idx: Map<string, number>, pred: (v: AnalyseVideo) => boolean) {
  const l = videos.filter(pred).map((v) => idx.get(v.id)).filter((x): x is number => x != null)
  return { n: l.length, index: median(l) }
}

export function vergleiche(videos: AnalyseVideo[], idx: Map<string, number>): Vergleich[] {
  const defs: { key: string; titel: string; a: string; b: string; ist: (v: AnalyseVideo) => boolean | null }[] = [
    { key: 'frage', titel: 'Frage in der Caption', a: 'mit Frage', b: 'ohne', ist: (v) => v.caption_frage },
    { key: 'sound', titel: 'Originalton statt Trend-Sound', a: 'Originalton', b: 'Trend-Sound',
      ist: (v) => v.tiktok_sound_original ?? v.ig_sound_original },
    { key: 'kurz', titel: 'Kurze Videos (bis 20 Sek.)', a: 'bis 20 s', b: 'länger',
      ist: (v) => (v.duration_seconds == null ? null : v.duration_seconds <= 20) },
    { key: 'tags', titel: 'Wenige Hashtags (bis 3)', a: 'bis 3', b: 'mehr',
      ist: (v) => (v.hashtag_anzahl == null ? null : v.hashtag_anzahl <= 3) },
    { key: 'wochenende', titel: 'Am Wochenende gepostet', a: 'Sa/So', b: 'Mo–Fr',
      ist: (v) => (v.wochentag == null ? null : v.wochentag >= 6) },
    { key: 'kurztext', titel: 'Kurze Caption (bis 80 Zeichen)', a: 'bis 80', b: 'länger',
      ist: (v) => (v.caption_laenge == null ? null : v.caption_laenge <= 80) },
  ]
  return defs.map((d) => {
    const a = gruppe(videos, idx, (v) => d.ist(v) === true)
    const b = gruppe(videos, idx, (v) => d.ist(v) === false)
    const genug = a.n >= MIN_GRUPPE && b.n >= MIN_GRUPPE && a.index != null && b.index != null && b.index > 0
    return {
      key: d.key, titel: d.titel,
      a: { label: d.a, ...a }, b: { label: d.b, ...b },
      vorteil: genug ? Math.round(((a.index! / b.index!) - 1) * 100) : null,
    }
  })
}

/** TikTok gegen Instagram beim selben Video: Median des Verhaeltnisses. */
export function plattformVerhaeltnis(videos: AnalyseVideo[]): { n: number; faktor: number | null } {
  const l = videos
    .filter((v) => (v.views_tiktok ?? 0) > 0 && (v.views_ig ?? 0) > 0)
    .map((v) => v.views_tiktok! / v.views_ig!)
  return { n: l.length, faktor: median(l) }
}

// ------------------------------------------------------------ Bestenlisten
export type Sortierung = 'views' | 'index' | 'share'

export function topVideos(videos: AnalyseVideo[], idx: Map<string, number>, nach: Sortierung, anzahl = 5): AnalyseVideo[] {
  const wert = (v: AnalyseVideo) =>
    nach === 'views' ? v.views : nach === 'index' ? idx.get(v.id) ?? null : v.share_rate_tiktok
  return videos
    .filter((v) => wert(v) != null && (nach !== 'share' || (v.views_tiktok ?? 0) >= 200))
    .sort((a, b) => (wert(b) ?? 0) - (wert(a) ?? 0))
    .slice(0, anzahl)
}

/** Videos, die nach Tag 1 noch kraeftig zugelegt haben. */
export function spaetzuender(videos: AnalyseVideo[], anzahl = 5): { video: AnalyseVideo; faktor: number }[] {
  return videos
    .filter((v) => (v.views_tag1 ?? 0) > 0 && v.views_tag28 != null)
    .map((v) => ({ video: v, faktor: v.views_tag28! / v.views_tag1! }))
    .filter((x) => x.faktor >= 2)
    .sort((a, b) => b.faktor - a.faktor)
    .slice(0, anzahl)
}

/** TikTok-Sounds, die mehrfach benutzt wurden, mit Median-Index. */
export function sounds(videos: AnalyseVideo[], idx: Map<string, number>, minN = 2): { sound: string; original: boolean; n: number; index: number | null }[] {
  const m = new Map<string, { original: boolean; werte: number[]; n: number }>()
  for (const v of videos) {
    if (!v.tiktok_sound) continue
    const e = m.get(v.tiktok_sound) ?? { original: !!v.tiktok_sound_original, werte: [], n: 0 }
    e.n++
    const i = idx.get(v.id)
    if (i != null) e.werte.push(i)
    m.set(v.tiktok_sound, e)
  }
  return [...m.entries()]
    .filter(([, e]) => e.n >= minN)
    .map(([sound, e]) => ({ sound, original: e.original, n: e.n, index: median(e.werte) }))
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
}

// ------------------------------------------------------------------ Format
export function faktorText(i: number | null): string {
  if (i == null) return '–'
  return i.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×'
}

export function prozentText(q: number | null, stellen = 1): string {
  if (q == null) return '–'
  return (q * 100).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) + ' %'
}

export function kurzZahl(n: number | null): string {
  if (n == null) return '–'
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio.'
  if (n >= 10_000) return Math.round(n / 1000).toLocaleString('de-DE') + ' Tsd.'
  return Math.round(n).toLocaleString('de-DE')
}

/** Zeitraum-Filter ueber das Veroeffentlichungsdatum. */
export function imZeitraum(v: AnalyseVideo, tage: number | null, jetzt = new Date()): boolean {
  if (tage == null) return true
  if (!v.veroeffentlicht) return false
  return jetzt.getTime() - Date.parse(v.veroeffentlicht) <= tage * 86_400_000
}

// ------------------------------------------------------------ Entwicklung
// Je Monat der Veroeffentlichung: wie viele Videos, wie viele Views (heutiger
// Stand) und wie sich die auf TikTok und Instagram verteilen.
export interface MonatsZeile { monat: string; anzahl: number; tiktok: number; ig: number; views: number; schnitt: number | null }

export function proMonat(videos: AnalyseVideo[]): MonatsZeile[] {
  const m = new Map<string, MonatsZeile>()
  for (const v of videos) {
    if (!v.veroeffentlicht) continue
    const monat = v.veroeffentlicht.slice(0, 7)
    const z = m.get(monat) ?? { monat, anzahl: 0, tiktok: 0, ig: 0, views: 0, schnitt: null }
    z.anzahl++
    z.tiktok += v.views_tiktok ?? 0
    z.ig += v.views_ig ?? 0
    // Gesamtviews notfalls aus "views", falls die Aufteilung fehlt
    z.views += (v.views_tiktok ?? 0) + (v.views_ig ?? 0) || (v.views ?? 0)
    m.set(monat, z)
  }
  return [...m.values()]
    .map((z) => ({ ...z, schnitt: z.anzahl ? z.views / z.anzahl : null }))
    .sort((a, b) => a.monat.localeCompare(b.monat))
}

export function monatsLabel(monat: string): string {
  const [j, mo] = monat.split('-').map(Number)
  return new Date(j, mo - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
}

// Follower-Verlauf: Summe ueber die Kunden, die schon am Anfang des Zeitraums
// gemessen wurden. Kommen spaeter neue Accounts dazu, wuerde die Kurve sonst
// einen Sprung zeigen, der kein echtes Wachstum ist. Ein Punkt pro Woche.
export interface FollowerPunkt { client_id: string; captured_on: string; followers_ig: number | null; followers_tiktok: number | null }

export function followerVerlauf(
  stats: FollowerPunkt[], kunden: Set<string>, abDatum: string | null,
): { tiktok: { x: string; y: number }[]; ig: { x: string; y: number }[] } {
  const rows = stats.filter((r) => kunden.has(r.client_id)).sort((a, b) => a.captured_on.localeCompare(b.captured_on))
  const start = abDatum && rows.some((r) => r.captured_on <= abDatum) ? abDatum : rows[0]?.captured_on ?? null
  if (!start) return { tiktok: [], ig: [] }
  // je Plattform: Kunden, die zum Start schon einen Wert haben
  const basisTT = new Set<string>(), basisIG = new Set<string>()
  for (const r of rows) {
    if (r.captured_on > start) break
    if (r.followers_tiktok != null) basisTT.add(r.client_id)
    if (r.followers_ig != null) basisIG.add(r.client_id)
  }
  const letztTT = new Map<string, number>(), letztIG = new Map<string, number>()
  const woche = new Map<string, { tt: number | null; ig: number | null }>()
  const wochenKey = (d: string) => {
    const t = new Date(d + 'T12:00:00Z'); const tag = (t.getUTCDay() + 6) % 7
    t.setUTCDate(t.getUTCDate() - tag); return t.toISOString().slice(0, 10)
  }
  for (const r of rows) {
    if (r.followers_tiktok != null && basisTT.has(r.client_id)) letztTT.set(r.client_id, r.followers_tiktok)
    if (r.followers_ig != null && basisIG.has(r.client_id)) letztIG.set(r.client_id, r.followers_ig)
    if (r.captured_on < start) continue
    const summe = (m: Map<string, number>, basis: Set<string>) => (basis.size && m.size === basis.size ? [...m.values()].reduce((a, b) => a + b, 0) : null)
    woche.set(wochenKey(r.captured_on), { tt: summe(letztTT, basisTT), ig: summe(letztIG, basisIG) })
  }
  const tiktok: { x: string; y: number }[] = [], ig: { x: string; y: number }[] = []
  for (const [x, w] of [...woche.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (w.tt != null) tiktok.push({ x, y: w.tt })
    if (w.ig != null) ig.push({ x, y: w.ig })
  }
  return { tiktok, ig }
}
