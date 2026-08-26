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

// Wert ueber einen Pfad holen: "playCount" oder verschachtelt "stats.playCount"
function at(obj: any, path: string): any {
  return path.split('.').reduce((o: any, k: string) => (o == null ? undefined : o[k]), obj)
}

// Alle Zielspalten in der Datenbank sind Ganzzahlen, Apify liefert aber teils
// Kommazahlen (z. B. Videolaenge 34.7356 s) — daher runden.
function pickNum(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = at(obj, k)
    if (typeof v === 'number' && !isNaN(v)) return Math.round(v)
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Math.round(Number(v))
  }
  return null
}

function pickStr(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = at(obj, k)
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

// Diagnose: welche Felder hat der Actor ueberhaupt geliefert? Wird nur
// mitgeschickt, wenn keine Aufrufzahl gefunden wurde — dann sieht man in
// der App sofort, unter welchem Namen die Zahl wirklich steckt.
function shape(obj: any, depth = 1): string[] {
  if (!obj || typeof obj !== 'object') return []
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && depth > 0) {
      out.push(...shape(v, depth - 1).map((s) => `${k}.${s}`))
    } else if (typeof v === 'number') {
      out.push(`${k}=${v}`)
    } else if (typeof v === 'string' && v.length <= 80) {
      out.push(`${k}="${v}"`)
    } else {
      out.push(k)
    }
  }
  return out
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

// Wie ein echtes Handy auftreten — mit "Mozilla/5.0" allein liefert TikTok
// keine saubere Weiterleitung, sondern eine Zwischenseite.
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
}

// Falls die Weiterleitung nicht greift: die echte Adresse aus dem Seitentext
// fischen (TikTok setzt sie als canonical/og:url bzw. direkt im Markup).
export function canonicalFromHtml(html: string): string | null {
  const direct = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d+/i)
  if (direct) return direct[0]
  const reel = html.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[\w\-]+/i)
  if (reel) return reel[0]
  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
  if (canon) return canon[1]
  const og = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
  if (og) return og[1]
  return null
}

async function resolveUrl(raw: string): Promise<string> {
  const u = raw.trim()
  if (!isShortLink(u)) return stripQuery(u)
  try {
    const resp = await fetch(u, { redirect: 'follow', headers: BROWSER_HEADERS })
    const final = resp.url || u
    // Weiterleitung hat gegriffen
    if (!isShortLink(final)) {
      try { await resp.body?.cancel() } catch { /* egal */ }
      return stripQuery(final)
    }
    // Immer noch kurz -> im Seiteninhalt nachsehen
    const html = await resp.text()
    return stripQuery(canonicalFromHtml(html) ?? final)
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
  thumbnail: string | null
  debug?: string[]
}

// Apify liefert bei Problemen statt eines Videos einen Fehler-Datensatz
// ({ error, errorCode, url }). Den als solchen erkennen und den echten
// Text weiterreichen, statt ihn als "keine Zahlen" zu behandeln.
function throwIfApifyError(it: any, urlStr: string): void {
  const msg = it?.errorDescription ?? it?.errorMessage ?? it?.error
  if (msg == null) return
  const code = it?.errorCode ? ` [${it.errorCode}]` : ''
  const text = String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)
  // Die tatsaechlich abgefragte Adresse mitgeben — daran sieht man sofort,
  // ob der Kurzlink aufgeloest wurde oder nicht.
  throw new Error(`${text}${code} — abgefragt: ${urlStr}`)
}

async function tiktokLookup(urlStr: string, actor: string, token: string): Promise<PlatformResult | null> {
  const items = await apifyRun(actor, { postURLs: [urlStr], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }, token)
  const it = items[0]
  // Leeres Ergebnis nicht stillschweigend schlucken — sonst steht in der App
  // nur "–" und niemand weiss, woran es lag.
  if (!it) throw new Error(`kein Ergebnis von Actor "${actor}" für ${urlStr}`)
  throwIfApifyError(it, urlStr)
  // Je nach Actor-Version stehen die Zahlen oben oder verschachtelt unter
  // "stats"/"statistics" — deshalb beide Ebenen abklopfen.
  const views = pickNum(it, [
    'playCount', 'stats.playCount', 'statistics.playCount', 'statsV2.playCount',
    'viewCount', 'stats.viewCount', 'videoViewCount', 'views', 'stats.views',
    'playcount', 'play_count', 'stats.play_count',
  ])
  return {
    views,
    likes: pickNum(it, ['diggCount', 'stats.diggCount', 'statistics.diggCount', 'statsV2.diggCount', 'likeCount', 'stats.likeCount', 'likes', 'stats.likes']),
    comments: pickNum(it, ['commentCount', 'stats.commentCount', 'statistics.commentCount', 'statsV2.commentCount', 'comments', 'stats.comments']),
    shares: pickNum(it, ['shareCount', 'stats.shareCount', 'statistics.shareCount', 'statsV2.shareCount', 'shares', 'stats.shares']),
    saves: pickNum(it, ['collectCount', 'stats.collectCount', 'statistics.collectCount', 'statsV2.collectCount', 'saves', 'stats.saves']),
    caption: pickStr(it, ['text', 'desc', 'title', 'description']),
    username: pickStr(it, ['authorUniqueId', 'authorName', 'authorMeta.name', 'authorMeta.nickName', 'author.uniqueId', 'author.nickname']),
    postedAt: pickDateISO(it, ['createTimeISO', 'createTime', 'createdAt', 'uploadedAt']),
    duration: pickNum(it, ['videoMeta.duration', 'duration', 'video.duration']),
    // Vorschaubild fuer die Inspirations-Karten. Diese CDN-Adressen laufen
    // nach einiger Zeit ab — die App blendet ein totes Bild einfach aus.
    thumbnail: pickStr(it, ['videoMeta.coverUrl', 'videoMeta.originalCoverUrl', 'covers.default', 'coverUrl', 'cover']),
    // Nur wenn keine Aufrufzahl gefunden wurde: Feldliste zur Diagnose
    debug: views == null ? shape(it).slice(0, 40) : undefined,
  }
}

async function instagramLookup(urlStr: string, actor: string, token: string): Promise<PlatformResult | null> {
  const items = await apifyRun(actor, { directUrls: [urlStr], resultsType: 'posts', resultsLimit: 1 }, token)
  const it = items[0]
  if (!it) throw new Error(`kein Ergebnis von Actor "${actor}" für ${urlStr}`)
  throwIfApifyError(it, urlStr)
  const views = pickNum(it, [
    'videoPlayCount', 'videoViewCount', 'playCount', 'views',
    'igPlayCount', 'video_play_count', 'video_view_count',
  ])
  return {
    views,
    likes: pickNum(it, ['likesCount', 'likes', 'like_count', 'edge_liked_by.count']),
    comments: pickNum(it, ['commentsCount', 'comments', 'comment_count']),
    shares: pickNum(it, ['sharesCount', 'shares', 'reshareCount', 'reshare_count']),
    saves: pickNum(it, ['savesCount', 'saves', 'save_count']),
    caption: pickStr(it, ['caption', 'text', 'description']),
    username: pickStr(it, ['ownerUsername', 'username', 'owner.username']),
    postedAt: pickDateISO(it, ['timestamp', 'takenAt', 'takenAtTimestamp', 'taken_at']),
    duration: pickNum(it, ['videoDuration', 'duration', 'video_duration']),
    thumbnail: pickStr(it, ['displayUrl', 'thumbnailUrl', 'imageUrl', 'display_url']),
    debug: views == null ? shape(it).slice(0, 40) : undefined,
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
