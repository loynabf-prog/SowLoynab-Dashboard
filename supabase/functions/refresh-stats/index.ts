// Supabase Edge Function: refresh-stats
// -------------------------------------------------------------------------
// Liest für jedes Video mit hinterlegtem TikTok-/Instagram-Link automatisch
// die aktuellen Zahlen (Views/Likes/Kommentare/Shares) über Apify aus und
// schreibt sie ins Video + als Tages-Schnappschuss in video_stats.
// Seit 0044 zusaetzlich alles, was dieselbe Antwort mitliefert (Uhrzeit,
// Caption, Hashtags, Sound, Vorschaubild, IG-Typ/Ort/Kommentare, TikTok-
// Follower) -- ohne zusaetzlichen Abruf.
//
// Prüf-Rhythmus pro Video (ab dem Post-Datum, spart unnötige Apify-Kosten):
//   Tag 0–7   -> jeden Tag       (Zahlen bewegen sich frisch am meisten)
//   Tag 8–28  -> einmal pro Woche (noch 3 Wochen lang)
//   ab Tag 29 -> einmal im Monat  (fängt späte Viral-Sprünge ab)
//
// Gedacht für einen täglichen Cron-Aufruf (siehe cron-setup.sql) — der Cron
// läuft jeden Tag, die Funktion selbst entscheidet pro Video, ob heute
// dran ist.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   APIFY_TOKEN            – dein Apify-API-Token (Pflicht)
//   APIFY_TIKTOK_ACTOR     – optional, Default clockworks~tiktok-scraper
//   APIFY_INSTAGRAM_ACTOR  – optional, Default apify~instagram-scraper
//
// Beim Deploy: "Enforce JWT" für diese Funktion AUSschalten (Cron ruft sie).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { tiktokMeta, instagramMeta, ohneLeere, coverSichern, tiktokFollowerSchreiben } from '../_shared/plattformMeta.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Erste vorhandene Zahl aus mehreren möglichen Feldnamen ziehen
// Alle Zielspalten in der Datenbank sind Ganzzahlen. Apify liefert aber
// teils Kommazahlen (z. B. Videolaenge 34.7356 s) — ungerundet scheitert
// das Speichern mit "invalid input syntax for type integer".
function pick(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && !isNaN(v)) return Math.round(v)
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Math.round(Number(v))
  }
  return null
}

async function apifyRun(actor: string, input: unknown, token: string): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=90`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) throw new Error(`Apify ${resp.status}: ${(await resp.text()).slice(0, 160)}`)
  const data = await resp.json()
  return Array.isArray(data) ? data : []
}

// roh: die komplette Antwort des Actors -- daraus kommen Uhrzeit, Caption,
// Sound, Vorschaubild usw. (_shared/plattformMeta.ts), ohne Zusatzabruf.
interface Stats { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; duration: number | null; roh: any }

async function tiktokStats(urlStr: string, actor: string, token: string): Promise<Stats | null> {
  const items = await apifyRun(actor, { postURLs: [urlStr], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }, token)
  const it = items[0]
  if (!it) return null
  return {
    views: pick(it, ['playCount', 'views', 'videoViewCount', 'playcount']),
    likes: pick(it, ['diggCount', 'likes', 'likeCount']),
    comments: pick(it, ['commentCount', 'comments']),
    shares: pick(it, ['shareCount', 'shares']),
    saves: pick(it, ['collectCount', 'saves']),
    duration: pick(it, ['videoMeta.duration', 'duration']) ?? pick(it?.videoMeta ?? {}, ['duration']),
    roh: it,
  }
}

async function instagramStats(urlStr: string, actor: string, token: string): Promise<Stats | null> {
  const items = await apifyRun(actor, { directUrls: [urlStr], resultsType: 'posts', resultsLimit: 1 }, token)
  const it = items[0]
  if (!it) return null
  return {
    views: pick(it, ['videoViewCount', 'videoPlayCount', 'views', 'playCount']),
    likes: pick(it, ['likesCount', 'likes']),
    comments: pick(it, ['commentsCount', 'comments']),
    shares: pick(it, ['sharesCount', 'shares', 'reshareCount']),
    saves: pick(it, ['savesCount', 'saves']),
    duration: pick(it, ['videoDuration', 'duration']),
    roh: it,
  }
}

function sum(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

// Tag 0-7 taeglich, Tag 8-28 woechentlich (Tag 14/21/28), ab Tag 29 einmal
// im Monat am selben Kalendertag wie gepostet (ueberspringt kurze Monate
// sauber -- holt es im Folgemonat automatisch nach).
function shouldCheckToday(postedAt: string, today: Date): boolean {
  const posted = new Date(postedAt)
  const days = Math.floor((today.getTime() - posted.getTime()) / 86400000)
  if (days < 0) return false
  if (days <= 7) return true
  if (days <= 28) return days % 7 === 0
  return today.getDate() === posted.getDate()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const ttActor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
    const igActor = Deno.env.get('APIFY_INSTAGRAM_ACTOR') || 'apify~instagram-scraper'

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Alle geposteten Videos mit mindestens einem Live-Link -- welche davon
    // heute wirklich geprueft werden, entscheidet shouldCheckToday() weiter
    // unten anhand des Post-Datums.
    const { data: vids, error } = await supa
      .from('videos')
      .select('id, client_id, tiktok_url, instagram_url, posted_at, tiktok_cover, ig_cover, ' +
              'views_ig, likes_ig, comments_ig, shares_ig, saves_ig, views_tiktok, likes_tiktok, comments_tiktok, shares_tiktok, saves_tiktok')
      .eq('status', 'posted')
      .is('deleted_at', null)
      .not('posted_at', 'is', null)
      .or('tiktok_url.not.is.null,instagram_url.not.is.null')
      .limit(2000)
    if (error) return json({ error: error.message }, 500)

    const body = await req.json().catch(() => ({}))
    // Nachzieh-Modus: { video_ids: [...] } holt genau diese Videos, egal wie alt.
    const nurIds: string[] | null = Array.isArray(body?.video_ids) ? body.video_ids.map(String) : null

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    let updated = 0
    const errors: string[] = []

    const faellig = ((vids ?? []) as any[]).filter((v) =>
      nurIds ? nurIds.includes(v.id) : (v.posted_at && shouldCheckToday(v.posted_at, now)))
    const due = faellig.length

    async function verarbeite(v: any) {
      // TikTok und Instagram gleichzeitig abfragen
      const [tt, ig] = await Promise.all([
        v.tiktok_url ? tiktokStats(v.tiktok_url, ttActor, token!).catch((e) => { errors.push(`tt ${v.id}: ${(e as Error).message}`); return null }) : Promise.resolve(null),
        v.instagram_url ? instagramStats(v.instagram_url, igActor, token!).catch((e) => { errors.push(`ig ${v.id}: ${(e as Error).message}`); return null }) : Promise.resolve(null),
      ])
      if (!tt && !ig) return

      // Schlaegt eine Plattform fehl (z. B. Apify-Limit), bleiben ihre alten
      // Zahlen stehen -- sonst wuerde ein Fehler die Views "auf null" setzen.
      const t = tt ?? { views: v.views_tiktok ?? null, likes: v.likes_tiktok ?? null, comments: v.comments_tiktok ?? null, shares: v.shares_tiktok ?? null, saves: v.saves_tiktok ?? null }
      const i = ig ?? { views: v.views_ig ?? null, likes: v.likes_ig ?? null, comments: v.comments_ig ?? null, shares: v.shares_ig ?? null, saves: v.saves_ig ?? null }
      const merged = {
        views: sum(t.views, i.views),
        likes: sum(t.likes, i.likes),
        comments: sum(t.comments, i.comments),
        shares: sum(t.shares, i.shares),
        saves: sum(t.saves, i.saves),
      }
      const reach = merged.views // beste verfügbare Näherung
      const duration = tt?.duration ?? ig?.duration ?? null
      // getrennt pro Plattform (für den IG-vs-TikTok-Vergleich in der Analyse)
      const perPlatform = {
        views_ig: i.views, likes_ig: i.likes, comments_ig: i.comments, shares_ig: i.shares, saves_ig: i.saves,
        views_tiktok: t.views, likes_tiktok: t.likes, comments_tiktok: t.comments, shares_tiktok: t.shares, saves_tiktok: t.saves,
      }

      const videoPatch: Record<string, unknown> = { ...merged, ...perPlatform, reach, stats_updated_at: new Date().toISOString() }
      if (duration != null) videoPatch.duration_seconds = duration

      // Alles Weitere aus derselben Antwort mitnehmen (Migration 0044).
      const ttMeta = tt ? tiktokMeta(tt.roh) : null
      const igMeta = ig ? instagramMeta(ig.roh) : null
      Object.assign(videoPatch, ohneLeere({ ...(ttMeta?.patch ?? {}), ...(igMeta?.patch ?? {}) }))
      if (ttMeta || igMeta) videoPatch.meta_updated_at = new Date().toISOString()
      // Vorschaubild nur einmal sichern -- es aendert sich nicht.
      if (ttMeta && !v.tiktok_cover) { const c = await coverSichern(supa, v.id, 'tiktok', ttMeta.coverQuelle); if (c) videoPatch.tiktok_cover = c }
      if (igMeta && !v.ig_cover) { const c = await coverSichern(supa, v.id, 'ig', igMeta.coverQuelle); if (c) videoPatch.ig_cover = c }
      // TikTok-Follower stehen in jeder Antwort mit drin.
      if (tt?.roh && v.client_id) { try { await tiktokFollowerSchreiben(supa, v.client_id, tt.roh) } catch { /* Zugabe */ } }

      let { error: upErr } = await supa.from('videos').update(videoPatch).eq('id', v.id)
      if (upErr) {
        const nurZahlen: Record<string, unknown> = { ...merged, ...perPlatform, reach, stats_updated_at: videoPatch.stats_updated_at }
        if (duration != null) nurZahlen.duration_seconds = duration
        ;({ error: upErr } = await supa.from('videos').update(nurZahlen).eq('id', v.id))
        if (upErr) errors.push(`upd ${v.id}: ${upErr.message}`)
      }
      // Tages-Schnappschuss, gesamt UND je Plattform (Migration 0057)
      const verlauf = {
        views_tiktok: t.views, likes_tiktok: t.likes, comments_tiktok: t.comments, shares_tiktok: t.shares, saves_tiktok: t.saves,
        views_ig: i.views, likes_ig: i.likes, comments_ig: i.comments,
      }
      // Verlaufspunkt nur, wenn jede verlinkte Plattform frisch geantwortet hat.
      const vollstaendig = (!v.tiktok_url || tt) && (!v.instagram_url || ig)
      if (!vollstaendig) return
      await supa.from('video_stats').delete().eq('video_id', v.id).eq('captured_on', today)
      const { error: insErr } = await supa.from('video_stats').insert({ video_id: v.id, captured_on: today, ...merged, reach, ...verlauf })
      if (insErr) await supa.from('video_stats').insert({ video_id: v.id, captured_on: today, ...merged, reach })
      updated++
    }

    // Zwei Videos gleichzeitig (= bis zu 4 Apify-Laeufe). Nacheinander lief der
    // Tageslauf ins Zeitlimit, mehr sprengt das Apify-Speicherlimit (16 GB).
    const PARALLEL = 2
    let pos = 0
    await Promise.all(Array.from({ length: Math.min(PARALLEL, faellig.length) }, async () => {
      while (pos < faellig.length) {
        const v = faellig[pos++]
        try { await verarbeite(v) } catch (e) { errors.push(`${v.id}: ${(e as Error).message}`) }
      }
    }))

    const nowIso = new Date().toISOString()
    try { await supa.from('system_status').upsert({ job: 'refresh-stats', last_ok: nowIso, last_error: null, detail: `${updated} aktualisiert von ${due} fälligen (${vids?.length ?? 0} insgesamt mit Link)`, updated_at: nowIso }, { onConflict: 'job' }) } catch { /* ignore */ }
    return json({ updated, due, checked: vids?.length ?? 0, errors: errors.slice(0, 8) })
  } catch (err) {
    try {
      const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const now = new Date().toISOString()
      await supa.from('system_status').upsert({ job: 'refresh-stats', last_error: `${(err as Error).message}`, last_error_at: now, updated_at: now }, { onConflict: 'job' })
    } catch { /* ignore */ }
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
