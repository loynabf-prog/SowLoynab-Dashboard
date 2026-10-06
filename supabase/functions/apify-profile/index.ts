// Supabase Edge Function: apify-profile
// -------------------------------------------------------------------------
// Holt zu einem Handle das öffentliche Profil (Bild, Followerzahl, Name)
// und legt das Profilbild dauerhaft in unserem eigenen Storage ab.
//
// Warum nicht einfach die Bild-Adresse von Instagram speichern: die läuft
// nach Stunden ab. Danach stünde beim Kunden ein kaputtes Bild — und
// niemand wüsste warum. Also einmal herunterladen, bei uns ablegen, fertig.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   APIFY_TOKEN                   – Pflicht
//   APIFY_TIKTOK_ACTOR             – optional, Default clockworks~tiktok-scraper
//   APIFY_INSTAGRAM_PROFILE_ACTOR  – optional, Default apify~instagram-profile-scraper
//
// Beim Deploy: "Enforce JWT" AN lassen — das ruft nur die angemeldete App.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

/** Die erste Adresse, die wie ein Bild aussieht -- die Actors benennen das Feld unterschiedlich. */
function bildAus(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.startsWith('http')) return v
  }
  return null
}

function zahlAus(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && !isNaN(v)) return Math.round(v)
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)

    const body = await req.json().catch(() => ({}))
    const platform = String(body?.platform ?? '').toLowerCase()
    const handle = String(body?.handle ?? '').replace(/^@/, '').trim()
    const clientId = body?.client_id ? String(body.client_id) : null
    if (!handle) return json({ error: 'Kein Handle angegeben.' }, 400)
    if (!['instagram', 'tiktok'].includes(platform)) return json({ error: 'Plattform muss instagram oder tiktok sein.' }, 400)

    let roh: any = null
    if (platform === 'tiktok') {
      const actor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
      const items = await apifyRun(actor, { profiles: [handle], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }, token)
      roh = items[0]?.authorMeta ?? items[0]?.author ?? items[0] ?? null
    } else {
      const actor = Deno.env.get('APIFY_INSTAGRAM_PROFILE_ACTOR') || 'apify~instagram-profile-scraper'
      roh = (await apifyRun(actor, { usernames: [handle] }, token))[0] ?? null
    }
    if (!roh) return json({ error: `Zu @${handle} kam nichts zurück. Handle richtig geschrieben? Profil öffentlich?` }, 404)

    const bildUrl = bildAus(roh, ['profilePicUrlHD', 'profilePicUrl', 'avatar', 'avatarMedium', 'originalAvatarUrl'])
    const follower = zahlAus(roh, ['followersCount', 'fans', 'followerCount', 'followers'])
    const anzeigename = typeof roh?.fullName === 'string' ? roh.fullName
      : typeof roh?.nickName === 'string' ? roh.nickName : null

    let logoUrl: string | null = null
    if (bildUrl && clientId) {
      const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      try {
        const bild = await fetch(bildUrl)
        if (!bild.ok) throw new Error(`Bild ${bild.status}`)
        const bytes = new Uint8Array(await bild.arrayBuffer())
        const typ = bild.headers.get('content-type') ?? 'image/jpeg'
        const endung = typ.includes('png') ? 'png' : typ.includes('webp') ? 'webp' : 'jpg'
        // Fester Pfad je Kunde und Plattform: ein erneuter Abruf ersetzt das
        // Bild, statt den Speicher mit alten Fassungen vollaufen zu lassen.
        const pfad = `auto/${clientId}-${platform}.${endung}`
        const up = await supa.storage.from('logos').upload(pfad, bytes, { contentType: typ, upsert: true })
        if (up.error) throw new Error(up.error.message)
        logoUrl = supa.storage.from('logos').getPublicUrl(pfad).data.publicUrl
        await supa.from('clients').update({ logo_url: logoUrl }).eq('id', clientId)
      } catch (e) {
        // Das Profil haben wir trotzdem -- nur das Bild hat nicht geklappt.
        return json({ logo_url: null, follower, anzeigename, warnung: `Bild konnte nicht gespeichert werden: ${(e as Error).message}` })
      }
    }

    return json({ logo_url: logoUrl, bild_url: bildUrl, follower, anzeigename })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
