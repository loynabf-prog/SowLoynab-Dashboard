// Supabase Edge Function: fetch-post-links
// -------------------------------------------------------------------------
// Holt nach dem Posten selbständig die Adressen der Postings.
//
// Der Gedanke dahinter ist einfach: Wenn jemand im Dashboard auf "Gepostet"
// drückt, ist das Video ein paar Minuten später online — und dann ist es
// zuverlässig das NEUESTE Posting dieses Kunden. Also warten wir kurz und
// greifen uns das oberste.
//
// Ablauf:
//   "Gepostet" gedrückt  -> videos.link_fetch_at = jetzt + ein paar Minuten
//   dieser Lauf (alle 5 Min)
//     -> fällige Videos holen
//     -> je Plattform das neueste Posting des Kunden abrufen
//     -> hängt die Adresse schon an einem anderen Video? Dann NICHT setzen,
//        sondern als 'unklar' markieren und nachfragen lassen.
//     -> sonst eintragen, fertig.
//
// Lieber nachfragen als falsch zuordnen: eine falsche Adresse zieht Monate
// später falsche Zahlen in die Auswertung, und niemand sucht dann noch hier.
//
// Secrets:
//   APIFY_TOKEN                   – Pflicht
//   APIFY_TIKTOK_ACTOR             – optional, Default clockworks~tiktok-scraper
//   APIFY_INSTAGRAM_ACTOR          – optional, Default apify~instagram-scraper
//
// Beim Deploy: "Enforce JWT" AUSschalten (der Cron ruft sie).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Nach so vielen vergeblichen Anläufen geben wir auf. Ein dauerhaft privates
// Profil soll nicht endlos Guthaben verbrennen.
const MAX_VERSUCHE = 4
// Wie alt darf ein gefundenes Posting höchstens sein, um als "das gerade
// gepostete" zu gelten? Großzügig genug für einen späten Upload, eng genug,
// um nicht das Video von vorgestern zu greifen.
const MAX_ALTER_STUNDEN = 8

async function apifyRun(actor: string, input: unknown, token: string): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=90`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) throw new Error(`Apify ${resp.status}: ${(await resp.text()).slice(0, 140)}`)
  const data = await resp.json()
  return Array.isArray(data) ? data : []
}

interface Posting { url: string; zeit: string | null }

function zeitAus(it: any): string | null {
  for (const k of ['timestamp', 'createTimeISO', 'takenAt', 'uploadedAtFormatted']) {
    const v = it?.[k]
    if (typeof v === 'string' && !isNaN(Date.parse(v))) return new Date(v).toISOString()
  }
  // TikTok liefert teils Sekunden seit 1970.
  const t = it?.createTime
  if (typeof t === 'number' && t > 1e9) return new Date(t * 1000).toISOString()
  return null
}

async function neuestesTiktok(handle: string, actor: string, token: string): Promise<Posting | null> {
  const items = await apifyRun(actor, {
    profiles: [handle], resultsPerPage: 3,
    shouldDownloadVideos: false, shouldDownloadCovers: false,
  }, token)
  const mit = items
    .map((it) => ({ url: String(it?.webVideoUrl ?? it?.postPage ?? ''), zeit: zeitAus(it) }))
    .filter((p) => p.url.startsWith('http'))
  return sortiere(mit)[0] ?? null
}

async function neuestesInstagram(handle: string, actor: string, token: string): Promise<Posting | null> {
  const items = await apifyRun(actor, {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts', resultsLimit: 3,
  }, token)
  const mit = items
    .map((it) => ({ url: String(it?.url ?? ''), zeit: zeitAus(it) }))
    .filter((p) => p.url.startsWith('http'))
  return sortiere(mit)[0] ?? null
}

/** Neueste zuerst. Ohne Zeitstempel ans Ende -- die Reihenfolge des Actors ist nicht garantiert. */
function sortiere(p: Posting[]): Posting[] {
  return [...p].sort((a, b) => (b.zeit ?? '').localeCompare(a.zeit ?? ''))
}

function zuAlt(p: Posting): boolean {
  if (!p.zeit) return false // ohne Zeitstempel nicht ausschliessen
  return Date.now() - Date.parse(p.zeit) > MAX_ALTER_STUNDEN * 3600_000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const ttActor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
    const igActor = Deno.env.get('APIFY_INSTAGRAM_ACTOR') || 'apify~instagram-scraper'

    const { data: faellig, error } = await supa
      .from('videos')
      .select('id, client_id, title, tiktok_url, instagram_url, link_fetch_tries')
      .is('deleted_at', null)
      .eq('status', 'posted')
      .not('link_fetch_at', 'is', null)
      .lte('link_fetch_at', new Date().toISOString())
      .lt('link_fetch_tries', MAX_VERSUCHE)
      .limit(20)
    if (error) return json({ error: error.message }, 500)
    if (!faellig?.length) return json({ geprueft: 0 })

    let gesetzt = 0
    let unklar = 0
    const fehler: string[] = []

    for (const v of faellig as any[]) {
      const versuch = (v.link_fetch_tries ?? 0) + 1
      const patch: Record<string, unknown> = { link_fetch_tries: versuch }

      // Welche Accounts hat der Kunde? Bei zwei Betrieben unter einem Dach
      // kann es mehrere je Plattform geben -- dann ist nicht zu entscheiden,
      // welcher gemeint war, also fragen wir.
      const { data: accs } = await supa
        .from('client_accounts').select('platform, handle').eq('client_id', v.client_id)
      let handles = (accs ?? []) as { platform: string; handle: string }[]
      if (handles.length === 0) {
        const { data: c } = await supa
          .from('clients').select('handle_ig, handle_tiktok').eq('id', v.client_id).maybeSingle()
        handles = [
          (c as any)?.handle_ig && { platform: 'instagram', handle: (c as any).handle_ig },
          (c as any)?.handle_tiktok && { platform: 'tiktok', handle: (c as any).handle_tiktok },
        ].filter(Boolean) as any[]
      }

      const notizen: string[] = []
      for (const feld of ['tiktok_url', 'instagram_url'] as const) {
        if (v[feld]) continue
        const platform = feld === 'tiktok_url' ? 'tiktok' : 'instagram'
        const passend = handles.filter((h) => h.platform === platform && h.handle)
        if (passend.length === 0) continue
        if (passend.length > 1) {
          notizen.push(`${platform}: mehrere Accounts hinterlegt — bitte von Hand zuordnen`)
          continue
        }
        const handle = passend[0].handle.replace(/^@/, '').trim()

        try {
          const p = platform === 'tiktok'
            ? await neuestesTiktok(handle, ttActor, token)
            : await neuestesInstagram(handle, igActor, token)
          if (!p) { notizen.push(`${platform}: kein Posting gefunden`); continue }
          if (zuAlt(p)) { notizen.push(`${platform}: neuestes Posting ist älter als ${MAX_ALTER_STUNDEN} h`); continue }

          // Haengt die Adresse schon an einem anderen Video? Dann haben wir
          // vermutlich dasselbe Posting zweimal gegriffen -- nicht setzen.
          const { data: schonDa } = await supa
            .from('videos').select('id, title').eq(feld, p.url).is('deleted_at', null).limit(1)
          if (schonDa?.length) {
            notizen.push(`${platform}: dieses Posting hängt schon an „${(schonDa[0] as any).title}"`)
            continue
          }
          patch[feld] = p.url
        } catch (e) {
          notizen.push(`${platform}: ${(e as Error).message}`)
        }
      }

      const neuTiktok = patch.tiktok_url ?? v.tiktok_url
      const neuInsta = patch.instagram_url ?? v.instagram_url
      const beide = !!neuTiktok && !!neuInsta

      if (beide) {
        patch.link_fetch_at = null
        patch.link_fetch_state = 'fertig'
        patch.link_fetch_note = null
        gesetzt++
      } else if (notizen.length > 0) {
        patch.link_fetch_state = 'unklar'
        patch.link_fetch_note = notizen.join(' · ')
        // Noch ein Anlauf später -- Instagram braucht manchmal länger, bis
        // ein frisches Reel über die Schnittstelle auftaucht.
        patch.link_fetch_at = versuch >= MAX_VERSUCHE
          ? null
          : new Date(Date.now() + 20 * 60_000).toISOString()
        if (versuch >= MAX_VERSUCHE) patch.link_fetch_state = 'fehlgeschlagen'
        unklar++
      } else {
        patch.link_fetch_at = new Date(Date.now() + 20 * 60_000).toISOString()
        patch.link_fetch_state = 'offen'
      }

      const { error: uErr } = await supa.from('videos').update(patch).eq('id', v.id)
      if (uErr) fehler.push(`${v.id}: ${uErr.message}`)
    }

    const nowIso = new Date().toISOString()
    try {
      await supa.from('system_status').upsert({
        job: 'fetch-post-links', last_ok: nowIso, last_error: null,
        detail: `${gesetzt} vollständig, ${unklar} offen von ${faellig.length}`, updated_at: nowIso,
      }, { onConflict: 'job' })
    } catch { /* ignore */ }

    return json({ geprueft: faellig.length, gesetzt, unklar, fehler: fehler.slice(0, 5) })
  } catch (err) {
    try {
      const nowIso = new Date().toISOString()
      await supa.from('system_status').upsert({
        job: 'fetch-post-links', last_error: `${(err as Error).message}`,
        last_error_at: nowIso, updated_at: nowIso,
      }, { onConflict: 'job' })
    } catch { /* ignore */ }
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
