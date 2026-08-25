// Supabase Edge Function: refresh-account-stats
// -------------------------------------------------------------------------
// Liest für jeden Kunden mit hinterlegtem Instagram-/TikTok-Handle einmal
// täglich die Account-Zahlen aus (Follower, Following, Anzahl Posts) und
// schreibt einen Tages-Punkt in client_stats. Die "Wachstum"-Kurve bei
// jedem Kunden füllt sich damit von selbst — "＋ Zahlen erfassen" bleibt
// weiterhin für die manuelle Eingabe (z. B. Reichweite) nutzbar.
//
// Anders als bei den Videos (refresh-stats, gestaffelt 7 Tage/wöchentlich/
// monatlich) läuft das hier NICHT gestaffelt: es gibt nur eine Handvoll
// Accounts, täglich ist hier kostenmäßig zu vernachlässigen.
//
// Ein vorhandener Eintrag für heute wird nur ergänzt (Follower/Following/
// Posts), eine von Hand eingetragene Reichweite für heute bleibt erhalten.
//
// Secrets (Supabase -> Edge Functions -> Secrets), teils dieselben wie bei
// refresh-stats:
//   APIFY_TOKEN                    – dein Apify-API-Token (Pflicht)
//   APIFY_TIKTOK_ACTOR              – optional, Default clockworks~tiktok-scraper
//   APIFY_INSTAGRAM_PROFILE_ACTOR   – optional, Default apify~instagram-profile-scraper
//
// Beim Deploy: "Enforce JWT" für diese Funktion AUSschalten (Cron ruft sie).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

interface AccountStats { followers: number | null; following: number | null; posts: number | null }

async function tiktokAccount(handle: string, actor: string, token: string): Promise<AccountStats | null> {
  const items = await apifyRun(actor, { profiles: [handle], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }, token)
  const it = items[0]
  if (!it) return null
  const author = it.authorMeta ?? it.author ?? it
  return {
    followers: pick(author, ['fans', 'followerCount', 'followers']),
    following: pick(author, ['following', 'followingCount']),
    posts: pick(author, ['video', 'videoCount', 'postsCount']),
  }
}

async function instagramAccount(handle: string, actor: string, token: string): Promise<AccountStats | null> {
  const items = await apifyRun(actor, { usernames: [handle] }, token)
  const it = items[0]
  if (!it) return null
  return {
    followers: pick(it, ['followersCount', 'followers']),
    following: pick(it, ['followsCount', 'followingCount', 'following']),
    posts: pick(it, ['postsCount', 'posts']),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const ttActor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
    const igActor = Deno.env.get('APIFY_INSTAGRAM_PROFILE_ACTOR') || 'apify~instagram-profile-scraper'

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: clients, error } = await supa
      .from('clients')
      .select('id, handle_ig, handle_tiktok')
      .is('deleted_at', null)
      .or('handle_ig.not.is.null,handle_tiktok.not.is.null')
      .limit(500)
    if (error) return json({ error: error.message }, 500)

    const today = new Date().toISOString().slice(0, 10)
    let updated = 0
    const errors: string[] = []

    for (const c of (clients ?? []) as any[]) {
      let tt: AccountStats | null = null
      let ig: AccountStats | null = null
      try { if (c.handle_tiktok) tt = await tiktokAccount(c.handle_tiktok.replace(/^@/, ''), ttActor, token) } catch (e) { errors.push(`tt ${c.id}: ${(e as Error).message}`) }
      try { if (c.handle_ig) ig = await instagramAccount(c.handle_ig.replace(/^@/, ''), igActor, token) } catch (e) { errors.push(`ig ${c.id}: ${(e as Error).message}`) }
      if (!tt && !ig) continue

      const patch = {
        followers_ig: ig?.followers ?? null,
        followers_tiktok: tt?.followers ?? null,
        following_ig: ig?.following ?? null,
        following_tiktok: tt?.following ?? null,
        posts_ig: ig?.posts ?? null,
        posts_tiktok: tt?.posts ?? null,
      }

      // Eintrag fuer heute ergaenzen statt ersetzen -- eine von Hand
      // eingetragene Reichweite (client_stats.reach) bleibt so erhalten.
      const { data: existing } = await supa
        .from('client_stats')
        .select('id')
        .eq('client_id', c.id)
        .eq('captured_on', today)
        .maybeSingle()
      if (existing) {
        await supa.from('client_stats').update(patch).eq('id', existing.id)
      } else {
        await supa.from('client_stats').insert({ client_id: c.id, captured_on: today, ...patch })
      }
      updated++
    }

    const nowIso = new Date().toISOString()
    try { await supa.from('system_status').upsert({ job: 'refresh-account-stats', last_ok: nowIso, last_error: null, detail: `${updated} von ${clients?.length ?? 0}`, updated_at: nowIso }, { onConflict: 'job' }) } catch { /* ignore */ }
    return json({ updated, checked: clients?.length ?? 0, errors: errors.slice(0, 8) })
  } catch (err) {
    try {
      const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const nowIso = new Date().toISOString()
      await supa.from('system_status').upsert({ job: 'refresh-account-stats', last_error: `${(err as Error).message}`, last_error_at: nowIso, updated_at: nowIso }, { onConflict: 'job' })
    } catch { /* ignore */ }
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
