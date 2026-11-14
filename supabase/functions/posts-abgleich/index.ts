// Supabase Edge Function: posts-abgleich
// -------------------------------------------------------------------------
// Trägt selbst ein, was bei TikTok/Instagram gepostet wurde (14.11.2026).
// Läuft um 17 Uhr und um 3 Uhr deutscher Zeit (der Cron ruft stündlich,
// die Funktion prüft die Uhrzeit selbst -- so stimmt es auch nach der
// Zeitumstellung). Mit { "jetzt": true } läuft sie sofort.
//
// Je aktivem Kunden: die letzten 5 Postings je Account holen, alles der
// letzten 10 Tage, was noch an keinem Video hängt (auch gelöschten!), per
// _shared/abgleich.ts einsortieren: Link ergänzen, Platzhalter füllen oder
// neues Video anlegen -- mit Titelbild, Caption, Zahlen.
//
// Secrets: APIFY_TOKEN (Pflicht), APIFY_TIKTOK_ACTOR, APIFY_INSTAGRAM_ACTOR
// Beim Deploy: "Enforce JWT" aus (der Cron ruft sie).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { tiktokMeta, instagramMeta, ohneLeere, coverSichern } from '../_shared/plattformMeta.ts'
import { planeAbgleich, normUrl, berlinDatum, istPlatzhalterTitel, type NeuesPosting, type Plattform } from '../_shared/abgleich.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const STUNDEN = [3, 17]
const FENSTER_TAGE = 10

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}

async function apifyRun(actor: string, input: unknown, token: string): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=110`
  const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  if (!resp.ok) throw new Error(`Apify ${resp.status}: ${(await resp.text()).slice(0, 140)}`)
  const data = await resp.json()
  return Array.isArray(data) ? data : []
}

function pick(obj: any, pfade: string[]): number | null {
  for (const p of pfade) {
    const v = p.split('.').reduce((o: any, k) => (o == null ? o : o[k]), obj)
    if (typeof v === 'number' && isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v)
  }
  return null
}
const zahlenTT = (it: any) => ({
  views: pick(it, ['playCount', 'views', 'videoViewCount']), likes: pick(it, ['diggCount', 'likes', 'likeCount']),
  comments: pick(it, ['commentCount', 'comments']), shares: pick(it, ['shareCount', 'shares']),
  saves: pick(it, ['collectCount', 'saves']), duration: pick(it, ['videoMeta.duration', 'duration']),
})
const zahlenIG = (it: any) => ({
  views: pick(it, ['videoViewCount', 'videoPlayCount', 'views', 'playCount']), likes: pick(it, ['likesCount', 'likes']),
  comments: pick(it, ['commentsCount', 'comments']), shares: pick(it, ['sharesCount', 'shares', 'reshareCount']),
  saves: pick(it, ['savesCount', 'saves']), duration: pick(it, ['videoDuration', 'duration']),
})

function zeitAus(it: any): string | null {
  for (const k of ['timestamp', 'createTimeISO', 'takenAt']) {
    const v = it?.[k]
    if (typeof v === 'string' && !isNaN(Date.parse(v))) return new Date(v).toISOString()
  }
  const t = it?.createTime
  if (typeof t === 'number' && t > 1e9) return new Date(t * 1000).toISOString()
  return null
}

type Roh = NeuesPosting & { roh: any }

async function holePostings(platform: Plattform, handle: string, channel: string | null, token: string): Promise<Roh[]> {
  const h = handle.replace(/^@/, '').trim()
  const items = platform === 'tiktok'
    ? await apifyRun(Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper',
        { profiles: [h], resultsPerPage: 5, shouldDownloadVideos: false, shouldDownloadCovers: false }, token)
    : await apifyRun(Deno.env.get('APIFY_INSTAGRAM_ACTOR') || 'apify~instagram-scraper',
        { directUrls: [`https://www.instagram.com/${h}/`], resultsType: 'posts', resultsLimit: 5 }, token)
  return items
    .map((it) => ({
      platform, channel_id: channel, roh: it, zeit: zeitAus(it) ?? '',
      url: String(platform === 'tiktok' ? (it?.webVideoUrl ?? it?.postPage ?? '') : (it?.url ?? '')),
    }))
    .filter((p) => p.url.startsWith('http') && p.zeit)
}

function titelAusCaption(c: string): string | null {
  const z = c.split('\n')[0].replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim()
  if (!z) return null
  return z.length > 50 ? z.slice(0, 49).trimEnd() + '…' : z
}

/** Alles, was ein Posting zu einem Video beiträgt: Link, Meta, Zahlen, Bild. */
async function postingPatch(supa: any, videoId: string, p: Roh, alt: Record<string, any>): Promise<Record<string, unknown>> {
  const tt = p.platform === 'tiktok'
  const meta = tt ? tiktokMeta(p.roh) : instagramMeta(p.roh)
  const z = tt ? zahlenTT(p.roh) : zahlenIG(p.roh)
  const patch: Record<string, unknown> = { ...ohneLeere(meta.patch), meta_updated_at: new Date().toISOString() }
  patch[tt ? 'tiktok_url' : 'instagram_url'] = p.url
  const pre = tt ? 'tiktok' : 'ig'
  patch[`views_${pre}`] = z.views; patch[`likes_${pre}`] = z.likes; patch[`comments_${pre}`] = z.comments
  patch[`shares_${pre}`] = z.shares; patch[`saves_${pre}`] = z.saves
  if (z.duration != null && alt.duration_seconds == null) patch.duration_seconds = Math.round(z.duration)
  const cover = await coverSichern(supa, videoId, tt ? 'tiktok' : 'ig', meta.coverQuelle)
  if (cover) patch[tt ? 'tiktok_cover' : 'ig_cover'] = cover
  return patch
}

function summen(v: Record<string, any>): Record<string, unknown> {
  const s = (a: any, b: any) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0))
  const views = s(v.views_tiktok, v.views_ig)
  return {
    views, reach: views, likes: s(v.likes_tiktok, v.likes_ig), comments: s(v.comments_tiktok, v.comments_ig),
    shares: s(v.shares_tiktok, v.shares_ig), saves: s(v.saves_tiktok, v.saves_ig), stats_updated_at: new Date().toISOString(),
  }
}

const bedienen = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const body = await req.json().catch(() => ({}))
  const stunde = Number(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(new Date()))
  if (!body?.jetzt && !STUNDEN.includes(stunde)) return json({ uebersprungen: `jetzt ${stunde} Uhr` })

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) return json({ error: 'APIFY_TOKEN fehlt' }, 500)

  const ab = new Date(Date.now() - FENSTER_TAGE * 86400_000).toISOString()
  let q = supa.from('clients').select('id, name, created_at, client_type, pausiert_seit, handle_ig, handle_tiktok')
    .eq('active', true).is('deleted_at', null).is('pausiert_seit', null).neq('client_type', 'passiv')
  if (typeof body?.client_id === 'string') q = q.eq('id', body.client_id)
  const { data: kunden, error } = await q
  if (error) return json({ error: error.message }, 500)

  const bericht: Record<string, unknown>[] = []
  const fehler: string[] = []

  for (const k of (kunden ?? []) as any[]) {
    try {
      const { data: accs } = await supa.from('client_accounts').select('platform, handle, channel_id').eq('client_id', k.id)
      let konten = ((accs ?? []) as any[]).filter((a) => (a.platform === 'tiktok' || a.platform === 'instagram') && a.handle)
      if (!konten.length) {
        konten = [
          k.handle_tiktok && { platform: 'tiktok', handle: k.handle_tiktok, channel_id: null },
          k.handle_ig && { platform: 'instagram', handle: k.handle_ig, channel_id: null },
        ].filter(Boolean)
      }
      if (!konten.length) continue

      const ergebnisse = await Promise.allSettled(konten.map((a: any) => holePostings(a.platform, a.handle, a.channel_id ?? null, token)))
      const alle: Roh[] = []
      ergebnisse.forEach((r, i) => {
        if (r.status === 'fulfilled') alle.push(...r.value)
        else fehler.push(`${k.name} ${konten[i].platform}: ${(r.reason as Error).message}`)
      })

      // Alles, was je an einem Video dieses Kunden hing -- auch im Papierkorb
      const { data: vids } = await supa.from('videos')
        .select('id, title, status, scheduled_date, posted_at, channel_id, tiktok_url, instagram_url, deleted_at, duration_seconds, ' +
                'views_tiktok, likes_tiktok, comments_tiktok, shares_tiktok, saves_tiktok, views_ig, likes_ig, comments_ig, shares_ig, saves_ig')
        .eq('client_id', k.id)
      const videos = (vids ?? []) as any[]
      const vergeben = new Set<string>()
      for (const v of videos) {
        if (v.tiktok_url) vergeben.add(normUrl(v.tiktok_url))
        if (v.instagram_url) vergeben.add(normUrl(v.instagram_url))
      }
      const neu = alle.filter((p) => p.zeit >= ab && p.zeit >= k.created_at && !vergeben.has(normUrl(p.url)))
      if (!neu.length) continue

      const lebend = videos.filter((v) => !v.deleted_at)
      const aktionen = planeAbgleich({
        neue: neu,
        offene: lebend.filter((v) => v.status === 'posted' && (!v.tiktok_url || !v.instagram_url))
          .map((v) => ({ id: v.id, posted_at: v.posted_at, channel_id: v.channel_id, hatTiktok: !!v.tiktok_url || !konten.some((a: any) => a.platform === 'tiktok'), hatInstagram: !!v.instagram_url || !konten.some((a: any) => a.platform === 'instagram') })),
        platzhalter: lebend.filter((v) => v.status !== 'posted' && v.scheduled_date && istPlatzhalterTitel(v.title))
          .map((v) => ({ id: v.id, scheduled_date: v.scheduled_date, channel_id: v.channel_id })),
      })

      let eingetragen = 0
      for (const a of aktionen) {
        const postings = (a.art === 'ergaenzen' ? [a.posting] : a.postings) as Roh[]
        const erstes = [...postings].sort((x, y) => x.zeit.localeCompare(y.zeit))[0]
        let id: string
        let alt: Record<string, any> = {}
        if (a.art === 'neu') {
          const { data: ins, error: e } = await supa.from('videos').insert({
            client_id: k.id, title: 'Gepostetes Video', status: 'posted',
            channel_id: erstes.channel_id, prep_shot: true, prep_edited: true, prep_scheduled: true,
            posted_at: erstes.zeit, scheduled_date: berlinDatum(erstes.zeit),
            link_fetch_state: 'fertig', notes: 'Automatisch eingetragen (Abgleich mit TikTok/Instagram)',
          }).select('id').single()
          if (e) { fehler.push(`${k.name}: ${e.message}`); continue }
          id = (ins as any).id
        } else {
          id = a.videoId
          alt = lebend.find((v) => v.id === id) ?? {}
        }
        const patch: Record<string, unknown> = {}
        for (const p of postings) Object.assign(patch, await postingPatch(supa, id, p, alt))
        if (a.art !== 'ergaenzen') {
          Object.assign(patch, {
            status: 'posted', posted_at: erstes.zeit, scheduled_date: berlinDatum(erstes.zeit),
            prep_shot: true, prep_edited: true, prep_scheduled: true, link_fetch_state: 'fertig', link_fetch_at: null,
          })
          if (erstes.channel_id) patch.channel_id = erstes.channel_id
          const cap = String(patch.tiktok_caption ?? patch.ig_caption ?? '')
          const t = titelAusCaption(cap)
          if (t && (a.art === 'neu' || istPlatzhalterTitel(alt.title))) patch.title = t
        }
        Object.assign(patch, summen({ ...alt, ...patch }))
        const { error: e } = await supa.from('videos').update(patch).eq('id', id)
        if (e) fehler.push(`${k.name}: ${e.message}`)
        else eingetragen++
      }
      bericht.push({ kunde: k.name, eingetragen, aktionen: aktionen.map((a) => a.art) })
    } catch (e) {
      fehler.push(`${k.name}: ${(e as Error).message}`)
    }
  }

  const nowIso = new Date().toISOString()
  try {
    await supa.from('system_status').upsert({
      job: 'posts-abgleich', last_ok: nowIso, last_error: fehler.length ? fehler.join(' | ').slice(0, 500) : null,
      detail: JSON.stringify(bericht).slice(0, 500), updated_at: nowIso,
    }, { onConflict: 'job' })
  } catch { /* egal */ }
  return json({ bericht, fehler })
}

if (typeof Deno !== 'undefined') Deno.serve(bedienen)
