// Supabase Edge Function: apify-lookup
// -------------------------------------------------------------------------
// Sofort-Abruf für EIN Video (zum Nachtragen alter, bereits geposteter
// Videos): aus einem TikTok- und/oder Instagram-Link werden Titel-Vorschlag
// (Caption), Nutzername (für die Kunden-Zuordnung), Postdatum und die
// Zahlen ausgelesen — getrennt pro Plattform. Das Dashboard baut daraus
// eine fertige Videokarte, die der Mensch nur noch bestätigt.
//
// Anders als "refresh-stats" (täglicher Cron über ALLE Videos) läuft das
// hier auf Zuruf für einen einzelnen Link, direkt aus der App heraus.
//
// Secrets (Supabase -> Edge Functions -> Secrets), dieselben wie bei
// refresh-stats:
//   APIFY_TOKEN            – dein Apify-API-Token (Pflicht)
//   APIFY_TIKTOK_ACTOR     – optional, Default clockworks~tiktok-scraper
//   APIFY_INSTAGRAM_ACTOR  – optional, Default apify~instagram-scraper
//
// "Enforce JWT" für diese Funktion AN lassen — nur eingeloggte Team-
// Mitglieder dürfen sie aufrufen.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function pickNum(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && !isNaN(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  }
  return null
}

function pickStr(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

function pickNested(obj: any, paths: string[]): string | null {
  for (const p of paths) {
    const v = p.split('.').reduce((o: any, k: string) => (o == null ? undefined : o[k]), obj)
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

// Erkennt sowohl ISO-Datumsstrings als auch Unix-Zeitstempel (Sekunden/Millisekunden)
function pickDateISO(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.trim() !== '') {
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    if (typeof v === 'number' && v > 0) {
      const ms = v < 10_000_000_000 ? v * 1000 : v
      const d = new Date(ms)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

// Teil-Links aufloesen: Beim Teilen liefert TikTok "vm.tiktok.com/XXXX" und
// Instagram "instagram.com/share/XXXX". Die Apify-Scraper brauchen aber die
// vollstaendige Adresse (.../@name/video/123...). Wir folgen der Weiterleitung
// einmal und schneiden die Tracking-Parameter ab.
function isShortLink(u: string): boolean {
  return /(?:vm|vt)\.tiktok\.com/i.test(u)
    || /instagram\.com\/share\//i.test(u)
    || (/tiktok\.com/i.test(u) && !/\/video\/\d/i.test(u))
}

async function resolveUrl(raw: string): Promise<string> {
  const u = raw.trim()
  if (!isShortLink(u)) return stripQuery(u)
  try {
    const resp = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } })
    try { await resp.body?.cancel() } catch { /* egal */ }
    return stripQuery(resp.url || u)
  } catch {
    return stripQuery(u)
  }
}

function stripQuery(u: string): string {
  const i = u.indexOf('?')
  return i === -1 ? u : u.slice(0, i)
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

interface PlatformResult {
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  caption: string | null
  username: string | null
  postedAt: string | null
  duration: number | null
}

async function tiktokLookup(urlStr: string, actor: string, token: string): Promise<PlatformResult | null> {
  const items = await apifyRun(actor, { postURLs: [urlStr], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }, token)
  const it = items[0]
  if (!it) return null
  return {
    views: pickNum(it, ['playCount', 'views', 'videoViewCount', 'playcount']),
    likes: pickNum(it, ['diggCount', 'likes', 'likeCount']),
    comments: pickNum(it, ['commentCount', 'comments']),
    shares: pickNum(it, ['shareCount', 'shares']),
    saves: pickNum(it, ['collectCount', 'saves']),
    caption: pickStr(it, ['text', 'desc', 'title']),
    username: pickStr(it, ['authorUniqueId', 'authorName']) ?? pickNested(it, ['authorMeta.name', 'author.uniqueId']),
    postedAt: pickDateISO(it, ['createTimeISO', 'createTime', 'createdAt']),
    duration: pickNum(it?.videoMeta ?? {}, ['duration']) ?? pickNum(it, ['duration']),
  }
}

async function instagramLookup(urlStr: string, actor: string, token: string): Promise<PlatformResult | null> {
  const items = await apifyRun(actor, { directUrls: [urlStr], resultsType: 'posts', resultsLimit: 1 }, token)
  const it = items[0]
  if (!it) return null
  return {
    views: pickNum(it, ['videoViewCount', 'videoPlayCount', 'views', 'playCount']),
    likes: pickNum(it, ['likesCount', 'likes']),
    comments: pickNum(it, ['commentsCount', 'comments']),
    shares: pickNum(it, ['sharesCount', 'shares', 'reshareCount']),
    saves: pickNum(it, ['savesCount', 'saves']),
    caption: pickStr(it, ['caption', 'text']),
    username: pickStr(it, ['ownerUsername', 'username']),
    postedAt: pickDateISO(it, ['timestamp', 'takenAt', 'takenAtTimestamp']),
    duration: pickNum(it, ['videoDuration', 'duration']),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { instagram_url, tiktok_url } = await req.json()
    if (!instagram_url && !tiktok_url) return json({ error: 'Bitte mindestens einen Link angeben.' }, 400)

    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const ttActor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
    const igActor = Deno.env.get('APIFY_INSTAGRAM_ACTOR') || 'apify~instagram-scraper'

    let tiktok: PlatformResult | null = null
    let instagram: PlatformResult | null = null
    const errors: string[] = []

    // Kurz-/Teil-Links zuerst in die vollstaendige Adresse aufloesen
    const ttUrl = tiktok_url ? await resolveUrl(tiktok_url) : null
    const igUrl = instagram_url ? await resolveUrl(instagram_url) : null

    if (ttUrl) {
      try { tiktok = await tiktokLookup(ttUrl, ttActor, token) } catch (e) { errors.push(`TikTok: ${(e as Error).message}`) }
    }
    if (igUrl) {
      try { instagram = await instagramLookup(igUrl, igActor, token) } catch (e) { errors.push(`Instagram: ${(e as Error).message}`) }
    }

    // Bewusst Status 200 auch bei "nichts gefunden": sonst verschluckt der
    // Supabase-Client die Meldung und zeigt nur "non-2xx status code" an.
    if (!tiktok && !instagram) {
      const detail = errors.join(' · ')
      return json({
        error: detail
          ? `Kein Ergebnis. ${detail}`
          : 'Kein Ergebnis für diesen Link. Bitte den vollständigen Link aus der App verwenden (bei TikTok: „Teilen → Link kopieren", nicht der Kurzlink aus dem Browser).',
        resolved: { tiktok: ttUrl, instagram: igUrl },
      })
    }

    return json({ tiktok, instagram, errors, resolved: { tiktok: ttUrl, instagram: igUrl } })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
