// Supabase Edge Function: refresh-account-stats
// -------------------------------------------------------------------------
// Liest für jeden hinterlegten Social-Account einmal täglich die Zahlen aus
// (Follower, Following, Anzahl Posts) und schreibt einen Tages-Punkt in
// client_stats. Die "Wachstum"-Kurve bei jedem Kunden füllt sich damit von
// selbst — "＋ Zahlen erfassen" bleibt weiterhin für die manuelle Eingabe
// (z. B. Reichweite) nutzbar.
//
// Seit Migration 0028 kann ein Kunde MEHRERE Accounts je Plattform haben
// (zwei Betriebe unter einem Kunden). Deshalb entstehen pro Kunde und Tag
// zwei Sorten Zeilen:
//
//   * je eine Zeile pro Account (account_id gesetzt) — für die Frage
//     "welcher Account wächst eigentlich?"
//   * eine Gesamtzeile (account_id leer) mit der Summe aller Accounts —
//     das ist die Zeile, die Kundenseite und Auswertung lesen.
//
// Fehlt die Tabelle client_accounts noch, fällt die Funktion automatisch auf
// die alten Spalten clients.handle_ig / handle_tiktok zurück und schreibt wie
// früher nur die Gesamtzeile.
//
// Anders als bei den Videos (refresh-stats, gestaffelt 7 Tage/wöchentlich/
// monatlich) läuft das hier NICHT gestaffelt: es gibt nur eine Handvoll
// Accounts, täglich ist hier kostenmäßig zu vernachlässigen.
//
// Ein vorhandener Eintrag für heute wird nur ergänzt, eine von Hand
// eingetragene Reichweite für heute bleibt erhalten.
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

// Ein abzufragender Account. account_id ist leer, solange die Tabelle
// client_accounts fehlt -- dann gibt es nur die Gesamtzeile.
interface Ziel { client_id: string; account_id: string | null; platform: 'instagram' | 'tiktok'; handle: string }

/** Zahlen einer Plattform auf die Spalten von client_stats verteilen. */
function spalten(platform: 'instagram' | 'tiktok', s: AccountStats) {
  return platform === 'instagram'
    ? { followers_ig: s.followers, following_ig: s.following, posts_ig: s.posts, followers_tiktok: null, following_tiktok: null, posts_tiktok: null }
    : { followers_tiktok: s.followers, following_tiktok: s.following, posts_tiktok: s.posts, followers_ig: null, following_ig: null, posts_ig: null }
}

const FELDER = ['followers_ig', 'followers_tiktok', 'following_ig', 'following_tiktok', 'posts_ig', 'posts_tiktok'] as const

/** Mehrere Account-Ergebnisse zu einer Gesamtzeile addieren. */
function summe(teile: Record<string, number | null>[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const f of FELDER) {
    const werte = teile.map((t) => t[f]).filter((v): v is number => typeof v === 'number')
    out[f] = werte.length ? werte.reduce((a, b) => a + b, 0) : null
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const ttActor = Deno.env.get('APIFY_TIKTOK_ACTOR') || 'clockworks~tiktok-scraper'
    const igActor = Deno.env.get('APIFY_INSTAGRAM_PROFILE_ACTOR') || 'apify~instagram-profile-scraper'

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Nur Accounts lebender Kunden. Der Umweg ueber die Kundenliste ist
    // noetig, weil client_accounts selbst kein deleted_at kennt.
    const { data: clients, error: cErr } = await supa
      .from('clients')
      .select('id, handle_ig, handle_tiktok')
      .is('deleted_at', null)
      .limit(500)
    if (cErr) return json({ error: cErr.message }, 500)
    const lebende = new Set((clients ?? []).map((c: any) => c.id))

    // Bevorzugt die neue Tabelle. Fehlt sie (Migration 0028 noch nicht
    // gelaufen), nehmen wir die alten Spalten -- dann verhaelt sich die
    // Funktion exakt wie vorher.
    let ziele: Ziel[] = []
    const { data: accounts, error: aErr } = await supa
      .from('client_accounts')
      .select('id, client_id, platform, handle')
      .limit(2000)
    if (!aErr && accounts) {
      ziele = (accounts as any[])
        .filter((a) => lebende.has(a.client_id) && a.handle)
        .map((a) => ({ client_id: a.client_id, account_id: a.id, platform: a.platform, handle: String(a.handle) }))
    } else {
      for (const c of (clients ?? []) as any[]) {
        if (c.handle_ig) ziele.push({ client_id: c.id, account_id: null, platform: 'instagram', handle: c.handle_ig })
        if (c.handle_tiktok) ziele.push({ client_id: c.id, account_id: null, platform: 'tiktok', handle: c.handle_tiktok })
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    const errors: string[] = []
    // Je Kunde sammeln, was die einzelnen Accounts geliefert haben.
    const proKunde = new Map<string, Record<string, number | null>[]>()
    let geholt = 0

    for (const z of ziele) {
      const h = z.handle.replace(/^@/, '').trim()
      if (!h) continue
      let s: AccountStats | null = null
      try {
        s = z.platform === 'tiktok'
          ? await tiktokAccount(h, ttActor, token)
          : await instagramAccount(h, igActor, token)
      } catch (e) {
        errors.push(`${z.platform} ${h}: ${(e as Error).message}`)
        continue
      }
      if (!s) continue
      geholt++

      const patch = spalten(z.platform, s)
      const liste = proKunde.get(z.client_id) ?? []
      liste.push(patch)
      proKunde.set(z.client_id, liste)

      // Zeile fuer genau diesen Account -- nur wenn wir die neue Tabelle
      // haben. Sonst gibt es nur die Gesamtzeile wie bisher.
      if (z.account_id) await schreibe(supa, z.client_id, today, z.account_id, patch)
    }

    // Gesamtzeile je Kunde: alle Accounts addiert. Zwei Instagram-Accounts
    // mit 900 und 1.100 Followern ergeben hier 2.000 -- so, wie man den
    // Kunden im Gespraech auch beziffert.
    let updated = 0
    for (const [clientId, teile] of proKunde) {
      await schreibe(supa, clientId, today, null, summe(teile))
      updated++
    }

    const nowIso = new Date().toISOString()
    try {
      await supa.from('system_status').upsert({
        job: 'refresh-account-stats', last_ok: nowIso, last_error: null,
        detail: `${updated} Kunden, ${geholt} von ${ziele.length} Accounts`, updated_at: nowIso,
      }, { onConflict: 'job' })
    } catch { /* ignore */ }
    return json({ updated, accounts: ziele.length, geholt, errors: errors.slice(0, 8) })
  } catch (err) {
    try {
      const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const nowIso = new Date().toISOString()
      await supa.from('system_status').upsert({ job: 'refresh-account-stats', last_error: `${(err as Error).message}`, last_error_at: nowIso, updated_at: nowIso }, { onConflict: 'job' })
    } catch { /* ignore */ }
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

/**
 * Tageszeile ergaenzen statt ersetzen -- eine von Hand eingetragene
 * Reichweite (client_stats.reach) bleibt so erhalten.
 */
async function schreibe(supa: any, clientId: string, tag: string, accountId: string | null, patch: Record<string, number | null>) {
  let q = supa.from('client_stats').select('id').eq('client_id', clientId).eq('captured_on', tag)
  q = accountId ? q.eq('account_id', accountId) : q.is('account_id', null)
  const { data: existing } = await q.maybeSingle()
  if (existing) {
    await supa.from('client_stats').update(patch).eq('id', existing.id)
  } else {
    const row: Record<string, unknown> = { client_id: clientId, captured_on: tag, ...patch }
    if (accountId) row.account_id = accountId
    await supa.from('client_stats').insert(row)
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
