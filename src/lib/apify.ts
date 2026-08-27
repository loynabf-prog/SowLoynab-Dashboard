import { supabase } from './supabase'

// Gemeinsame Anbindung an die Edge Function "apify-lookup".
// Wird an zwei Stellen gebraucht: beim Nachtragen alter Videos und beim
// Merken einer Inspiration.

export interface PlatformResult {
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  caption: string | null
  username: string | null
  postedAt: string | null
  duration: number | null
  thumbnail?: string | null
  debug?: string[]
}

export interface LookupResult {
  tiktok: PlatformResult | null
  instagram: PlatformResult | null
  errors?: string[]
}

// Bei einem Fehlerstatus liefert der Supabase-Client nur "Edge Function
// returned a non-2xx status code". Die eigentliche Meldung steckt im
// Antwort-Körper — den holen wir hier heraus, damit der Grund sichtbar wird.
export async function readFnError(err: any): Promise<string> {
  try {
    const body = await err?.context?.json?.()
    if (body?.error) return String(body.error)
  } catch { /* kein JSON-Körper */ }
  try {
    const txt = await err?.context?.text?.()
    if (txt) return String(txt).slice(0, 300)
  } catch { /* nichts lesbar */ }
  return err?.message ?? 'Unbekannter Fehler'
}

// Scraper-Meldungen in Klartext übersetzen — "POST_NOT_FOUND_OR_PRIVATE"
// hilft niemandem weiter.
export function klartext(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('not found or private') || m.includes('post_not_found')) {
    return 'TikTok gibt dieses Video öffentlich nicht heraus — es ist gelöscht, auf privat gestellt, altersbeschränkt oder regional gesperrt. Zum Prüfen: den Link in einem privaten Browserfenster (ausgeloggt) öffnen. Lädt er dort nicht, sieht der Abruf dasselbe.'
  }
  if (m.includes('usage') || m.includes('limit') || m.includes('credit') || m.includes('quota')) {
    return 'Das Apify-Guthaben ist aufgebraucht. Unter Apify → Billing → Usage nachsehen.'
  }
  if (m.includes('401') || m.includes('unauthor') || m.includes('token')) {
    return 'Apify weist den Zugang ab — bitte den APIFY_TOKEN in den Supabase-Secrets prüfen.'
  }
  return msg
}

export type Platform = 'tiktok' | 'instagram' | 'other'

// Anhand der Adresse erkennen, welcher Scraper zuständig ist.
export function detectPlatform(url: string): Platform {
  const u = url.toLowerCase()
  if (/tiktok\.com/.test(u)) return 'tiktok'
  if (/instagram\.com|instagr\.am/.test(u)) return 'instagram'
  return 'other'
}

export const PLATFORM_ICON: Record<Platform, string> = {
  tiktok: '🎵',
  instagram: '📸',
  other: '🔗',
}


// Ruft die Edge Function auf und wirft bei Fehlern eine Meldung in Klartext.
export async function lookupVideo(opts: { tiktok_url?: string | null; instagram_url?: string | null }): Promise<LookupResult> {
  const { data, error } = await supabase.functions.invoke('apify-lookup', {
    body: { instagram_url: opts.instagram_url ?? null, tiktok_url: opts.tiktok_url ?? null },
  })
  if (error) throw new Error(klartext(await readFnError(error)))
  if ((data as any)?.error) throw new Error(klartext(String((data as any).error)))
  return data as LookupResult
}

// Einen einzelnen Link abrufen — die Plattform wird selbst erkannt.
export async function lookupOne(url: string): Promise<PlatformResult> {
  const p = detectPlatform(url)
  if (p === 'other') throw new Error('Das sieht nicht nach einem TikTok- oder Instagram-Link aus.')
  const res = await lookupVideo(p === 'tiktok' ? { tiktok_url: url } : { instagram_url: url })
  const hit = p === 'tiktok' ? res.tiktok : res.instagram
  if (!hit) throw new Error(klartext((res.errors ?? []).join(' · ') || 'Kein Ergebnis für diesen Link.'))
  return hit
}

// Kompakte Zahl fürs Auge: 12400 -> "12,4k"
export function compactNum(n: number | null | undefined): string {
  if (n == null) return '–'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + 'k'
  return String(n)
}

// Aus einem Abruf die Zahlen-Felder fuer ein Video bauen.
// Alle Zielspalten sind Ganzzahlen, Apify liefert teils Kommazahlen
// (z. B. Videolaenge 34.7356 s) -- deshalb wird ueberall gerundet.
export function statsPatch(res: LookupResult): Record<string, number | string | null> {
  const tt = res.tiktok
  const ig = res.instagram
  const int = (n?: number | null) => (n == null || isNaN(n) ? null : Math.round(n))
  const sum2 = (a?: number | null, b?: number | null) => (a == null && b == null ? null : Math.round((a ?? 0) + (b ?? 0)))
  return {
    views: sum2(tt?.views, ig?.views),
    likes: sum2(tt?.likes, ig?.likes),
    comments: sum2(tt?.comments, ig?.comments),
    shares: sum2(tt?.shares, ig?.shares),
    saves: sum2(tt?.saves, ig?.saves),
    reach: sum2(tt?.views, ig?.views),
    views_ig: int(ig?.views), likes_ig: int(ig?.likes), comments_ig: int(ig?.comments),
    shares_ig: int(ig?.shares), saves_ig: int(ig?.saves),
    views_tiktok: int(tt?.views), likes_tiktok: int(tt?.likes), comments_tiktok: int(tt?.comments),
    shares_tiktok: int(tt?.shares), saves_tiktok: int(tt?.saves),
    duration_seconds: int(tt?.duration ?? ig?.duration),
    stats_updated_at: new Date().toISOString(),
  }
}
