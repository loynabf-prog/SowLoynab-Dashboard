// Supabase Edge Function: briefkasten-waechter
// -------------------------------------------------------------------------
// Schaut alle paar Minuten (pg_cron) in "1 Briefkasten/<Kunde>". Liegen dort
// Videos und ist seit RUHE_MIN Minuten nichts Neues dazugekommen, ist der
// Upload fertig: Der Waechter legt einen Drehtag-Auftrag an (wie frueher der
// Knopf "Drehtag abschliessen") und weckt die Schnitt-Automatik. Die sortiert
// die Clips in die Videoideen (2 In Arbeit/<Kunde> - <Idee>), legt fehlende
// Ideen an und stellt Bestellzettel in die Backstube. (Fassie, 28.10.2026)
//
// Kein Doppelstart: pro Briefkasten-Ordner hoechstens ein offener Auftrag,
// und jeder Stapel (= neueste Datei) wird nur einmal gemeldet
// (Tabelle briefkasten_starts).
//
// Secrets (schon da): DROPBOX_APP_KEY, DROPBOX_APP_SECRET, ROUTINE_FIRE_TOKEN,
// optional ROUTINE_ID. Der Refresh-Token liegt in dropbox_verbindung.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BRIEFKASTEN = '/Sow & Loynab Media/1 Briefkasten'
const KUNDEN = '/Sow & Loynab Media/Kunden'
const RUHE_MIN = 10
const VIDEO = /\.(mov|mp4|m4v|hevc|avi|mts|mxf)$/i

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_KEY = Deno.env.get('DROPBOX_APP_KEY') ?? ''
const APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET') ?? ''
const ROUTINE_ID = Deno.env.get('ROUTINE_ID') || 'trig_016S6ostZ4JciCjKyEzkK1ob'
const TOKEN = Deno.env.get('ROUTINE_FIRE_TOKEN') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE)

function antwort(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

async function accessToken(): Promise<string> {
  const { data } = await admin.from('dropbox_verbindung').select('refresh_token').eq('id', 1).maybeSingle()
  if (!data?.refresh_token) throw new Error('Dropbox ist nicht verbunden')
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token, client_id: APP_KEY, client_secret: APP_SECRET }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error('Dropbox-Anmeldung: ' + (j.error_description ?? j.error ?? res.status))
  return j.access_token
}

async function listeAlles(token: string, pfad: string): Promise<any[]> {
  const rufe = async (endpunkt: string, body: unknown) => {
    const r = await fetch(`https://api.dropboxapi.com/2/${endpunkt}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('Dropbox: ' + (await r.text()).slice(0, 200))
    return r.json()
  }
  const out: any[] = []
  let r = await rufe('files/list_folder', { path: pfad, recursive: true, limit: 2000 })
  out.push(...r.entries)
  while (r.has_more && out.length < 5000) {
    r = await rufe('files/list_folder/continue', { cursor: r.cursor })
    out.push(...r.entries)
  }
  return out
}

async function automatikWecken(anlass: string): Promise<boolean> {
  if (!TOKEN) return false
  const { data: letzte } = await admin.from('automatik_starts').select('created_at').eq('ok', true).order('created_at', { ascending: false }).limit(1)
  const zuletzt = letzte?.[0]?.created_at as string | undefined
  if (zuletzt && Date.now() - Date.parse(zuletzt) < 10 * 60_000) return false // laeuft gerade an, nimmt es mit
  const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${ROUTINE_ID}/fire`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `Gestartet vom Briefkasten-Wächter. Anlass: ${anlass}` }),
  })
  const j = await res.json().catch(() => ({}))
  await admin.from('automatik_starts').insert({
    anlass, ok: res.ok, fehler: res.ok ? null : ((j as any)?.error?.message ?? `HTTP ${res.status}`),
    session_url: (j as any)?.claude_code_session_url ?? null,
  })
  return res.ok
}

Deno.serve(async () => {
  try {
    const token = await accessToken()
    const eintraege = await listeAlles(token, BRIEFKASTEN)

    // Videos je Kundenordner (erste Ebene unter dem Briefkasten)
    const stapel = new Map<string, { dateien: number; neueste: number }>()
    for (const e of eintraege) {
      if (e['.tag'] !== 'file' || !VIDEO.test(e.name)) continue
      const rest = (e.path_display as string).slice(BRIEFKASTEN.length + 1)
      const kunde = rest.split('/')[0]
      if (!kunde || kunde === rest) continue // Datei direkt im Briefkasten ohne Kunde: ignorieren
      const zeit = Date.parse(e.server_modified ?? e.client_modified ?? '') || Date.now()
      const s = stapel.get(kunde) ?? { dateien: 0, neueste: 0 }
      s.dateien++
      s.neueste = Math.max(s.neueste, zeit)
      stapel.set(kunde, s)
    }

    const { data: kunden } = await admin.from('clients').select('id, name, dropbox_ordner').is('deleted_at', null)
    const kundeVon = (ordnerName: string) => (kunden ?? []).find((c: any) =>
      (c.dropbox_ordner ?? []).some((o: string) => o.toLowerCase().replace(/\/+$/, '') === `${KUNDEN}/${ordnerName}`.toLowerCase()))

    const ergebnis: { ordner: string; dateien: number; was: string }[] = []
    let neu = 0
    for (const [ordnerName, s] of stapel) {
      const ordner = `${BRIEFKASTEN}/${ordnerName}`
      if (Date.now() - s.neueste < RUHE_MIN * 60_000) { ergebnis.push({ ordner, dateien: s.dateien, was: 'Upload läuft noch' }); continue }

      const { count: offen } = await admin.from('produktion_auftraege').select('id', { count: 'exact', head: true })
        .eq('ordner', ordner).in('status', ['wartet', 'laeuft']).is('deleted_at', null)
      if ((offen ?? 0) > 0) { ergebnis.push({ ordner, dateien: s.dateien, was: 'Auftrag läuft schon' }); continue }

      const { count: gemeldet } = await admin.from('briefkasten_starts').select('id', { count: 'exact', head: true })
        .eq('ordner', ordner).gte('created_at', new Date(s.neueste).toISOString())
      if ((gemeldet ?? 0) > 0) { ergebnis.push({ ordner, dateien: s.dateien, was: 'Schon gemeldet' }); continue }

      const kunde = kundeVon(ordnerName)
      if (!kunde) { ergebnis.push({ ordner, dateien: s.dateien, was: 'Kein Kunde zu diesem Ordner' }); continue }

      const { data: a, error } = await admin.from('produktion_auftraege')
        .insert({ client_id: kunde.id, ordner, dateien: s.dateien, schritt: 'Aus dem Briefkasten – wird sortiert' })
        .select('id').single()
      if (error) { ergebnis.push({ ordner, dateien: s.dateien, was: 'Fehler: ' + error.message }); continue }
      await admin.from('briefkasten_starts').insert({ ordner, dateien: s.dateien, auftrag_id: (a as any).id })
      neu++
      ergebnis.push({ ordner, dateien: s.dateien, was: `Drehtag angelegt (${kunde.name})` })
    }

    const geweckt = neu > 0 ? await automatikWecken(`Briefkasten: ${neu} neue(r) Drehtag(e)`) : false
    return antwort({ ok: true, neu, geweckt, ergebnis })
  } catch (e) {
    return antwort({ ok: false, error: (e as Error).message }, 500)
  }
})
