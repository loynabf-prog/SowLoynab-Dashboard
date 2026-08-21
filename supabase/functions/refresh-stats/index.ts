// Supabase Edge Function: refresh-stats
// -------------------------------------------------------------------------
// Liest für jedes Video mit hinterlegtem TikTok-/Instagram-Link automatisch
// die aktuellen Zahlen (Views/Likes/Kommentare/Shares) über Apify aus und
// schreibt sie ins Video + als Tages-Schnappschuss in video_stats.
//
// Gedacht für einen täglichen Cron-Aufruf (siehe cron-setup.sql).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   APIFY_TOKEN            – dein Apify-API-Token (Pflicht)
//   APIFY_TIKTOK_ACTOR     – optional, Default clockworks~tiktok-scraper
//   APIFY_INSTAGRAM_ACTOR  – optional, Default apify~instagram-scraper
//
// Beim Deploy: "Enforce JWT" für diese Funktion AUSschalten (Cron ruft sie).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Erste vorhandene Zahl aus mehreren möglichen Feldnamen ziehen
function pick(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && !isNaN(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
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

interface Stats { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }

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
  }
}

function sum(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const ttActor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
    const igActor = Deno.env.get('APIFY_INSTAGRAM_ACTOR') || 'apify~instagram-scraper'

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Videos mit mindestens einem Live-Link, die letzten 90 Tage
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const { data: vids, error } = await supa
      .from('videos')
      .select('id, tiktok_url, instagram_url, scheduled_date')
      .is('deleted_at', null)
      .or('tiktok_url.not.is.null,instagram_url.not.is.null')
      .limit(120)
    if (error) return json({ error: error.message }, 500)

    const today = new Date().toISOString().slice(0, 10)
    let updated = 0
    const errors: string[] = []

    for (const v of (vids ?? []) as any[]) {
      if (v.scheduled_date && v.scheduled_date < cutoff) continue // sehr alte auslassen (Kosten)
      let tt: Stats | null = null
      let ig: Stats | null = null
      try { if (v.tiktok_url) tt = await tiktokStats(v.tiktok_url, ttActor, token) } catch (e) { errors.push(`tt ${v.id}: ${(e as Error).message}`) }
      try { if (v.instagram_url) ig = await instagramStats(v.instagram_url, igActor, token) } catch (e) { errors.push(`ig ${v.id}: ${(e as Error).message}`) }
      if (!tt && !ig) continue

      const merged = {
        views: sum(tt?.views ?? null, ig?.views ?? null),
        likes: sum(tt?.likes ?? null, ig?.likes ?? null),
        comments: sum(tt?.comments ?? null, ig?.comments ?? null),
        shares: sum(tt?.shares ?? null, ig?.shares ?? null),
        saves: sum(tt?.saves ?? null, ig?.saves ?? null),
      }
      const reach = merged.views // beste verfügbare Näherung

      await supa.from('videos').update({ ...merged, reach, stats_updated_at: new Date().toISOString() }).eq('id', v.id)
      // Tages-Schnappschuss (heutigen Eintrag ersetzen, damit die Kurve sauber bleibt)
      await supa.from('video_stats').delete().eq('video_id', v.id).eq('captured_on', today)
      await supa.from('video_stats').insert({ video_id: v.id, captured_on: today, ...merged, reach })
      updated++
    }

    return json({ updated, checked: vids?.length ?? 0, errors: errors.slice(0, 8) })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
