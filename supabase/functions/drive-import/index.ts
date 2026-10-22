// Supabase Edge Function: drive-import
// -------------------------------------------------------------------------
// Holt alle Dateien aus einem oeffentlichen Google-Drive-Ordner in den
// Eingang eines Kunden in Dropbox (1 Eingang/<Kunde>). Dropbox laedt selbst vom Link
// (files/save_url) -- grosse 4K-Videos laufen also nie ueber uns.
//
// Arbeitet nur die Tabelle drive_importe ab (Migration 0052):
//   neu    -> Ordner auslesen, fuer jede Datei save_url starten -> laeuft
//   laeuft -> Stand der Dropbox-Jobs pruefen -> fertig / fehler
// Mehrfach aufrufen, bis alles fertig ist (die App bzw. ein Cron tut das).
//
// Secrets wie dropbox-media: DROPBOX_APP_KEY, DROPBOX_APP_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_KEY = Deno.env.get('DROPBOX_APP_KEY') ?? ''
const APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE)
const ZIEL = /^\/Sow & Loynab Media\/1 Eingang\/[^/]+$/

interface Datei { id: string; name: string; job?: string | null; status: 'offen' | 'laeuft' | 'fertig' | 'fehler'; fehler?: string }

let cache: { token: string; bis: number } | null = null
async function accessToken(): Promise<string> {
  if (cache && cache.bis > Date.now() + 60_000) return cache.token
  const { data } = await admin.from('dropbox_verbindung').select('refresh_token').eq('id', 1).maybeSingle()
  if (!data?.refresh_token || !APP_KEY || !APP_SECRET) throw new Error('Dropbox ist nicht verbunden')
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token, client_id: APP_KEY, client_secret: APP_SECRET }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error('Dropbox-Anmeldung abgelaufen (' + (j.error_description ?? j.error ?? res.status) + ')')
  cache = { token: j.access_token, bis: Date.now() + (j.expires_in ?? 14400) * 1000 }
  return cache.token
}

async function rpc(endpunkt: string, body: unknown): Promise<any> {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpunkt}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let j: any = null
  try { j = JSON.parse(text) } catch { /* kein JSON */ }
  if (!res.ok) throw new Error('Dropbox: ' + (j?.error_summary ?? text.slice(0, 200)))
  return j
}

/** Ordner-Id aus einem Drive-Link ziehen. */
function ordnerId(link: string): string | null {
  return link.match(/folders\/([A-Za-z0-9_-]{10,})/)?.[1] ?? link.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1] ?? null
}

function entities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** Dateien eines oeffentlichen Ordners ueber die schlichte Einbettungs-Ansicht lesen. */
async function driveListe(id: string): Promise<{ dateien: { id: string; name: string }[]; ordner: string[] }> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'de-DE,de;q=0.9' },
  })
  if (!res.ok) throw new Error(`Drive-Ordner nicht lesbar (${res.status}) – ist er auf „Jeder mit dem Link" gestellt?`)
  const html = await res.text()
  const dateien: { id: string; name: string }[] = []
  const ordner: string[] = []
  const eintrag = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g
  for (const m of html.matchAll(eintrag)) {
    const name = entities(m[3].trim())
    if (m[2].includes('/folders/')) ordner.push(name)
    else dateien.push({ id: m[1], name })
  }
  if (!dateien.length && !ordner.length && /ServiceLogin|accounts\.google\.com/.test(html)) {
    throw new Error('Drive verlangt eine Anmeldung – Ordner bitte auf „Jeder mit dem Link kann ansehen" stellen')
  }
  return { dateien, ordner }
}

function sichererName(n: string): string {
  return n.replace(/[\\/:*?"<>|]/g, '_').trim() || 'datei'
}

async function bearbeite(imp: any) {
  let dateien: Datei[] = Array.isArray(imp.dateien) ? imp.dateien : []
  let notiz: string | null = imp.notiz ?? null

  if (imp.status === 'neu') {
    if (!ZIEL.test(imp.ziel)) throw new Error('Ziel muss ein Kundenordner in 1 Eingang sein')
    const id = ordnerId(imp.quelle)
    if (!id) throw new Error('Das ist kein Google-Drive-Ordnerlink')
    const l = await driveListe(id)
    if (!l.dateien.length) throw new Error(l.ordner.length ? `Nur Unterordner gefunden (${l.ordner.join(', ')}) – bitte den Link des Unterordners schicken` : 'Der Ordner ist leer')
    dateien = l.dateien.map((d) => ({ id: d.id, name: d.name, status: 'offen' as const }))
    if (l.ordner.length) notiz = `Unterordner nicht mitgenommen: ${l.ordner.join(', ')}`
  }

  // Offene Dateien starten (Dropbox holt selbst vom Link)
  for (const d of dateien.filter((x) => x.status === 'offen')) {
    try {
      const url = `https://drive.usercontent.google.com/download?id=${d.id}&export=download&confirm=t`
      const r = await rpc('files/save_url', { path: `${imp.ziel}/${sichererName(d.name)}`, url })
      if (r['.tag'] === 'complete') d.status = 'fertig'
      else { d.job = r.async_job_id; d.status = 'laeuft' }
    } catch (e) {
      d.status = 'fehler'; d.fehler = (e as Error).message
    }
  }

  // Laufende Jobs pruefen
  for (const d of dateien.filter((x) => x.status === 'laeuft' && x.job)) {
    try {
      const r = await rpc('files/save_url/check_job_status', { async_job_id: d.job })
      if (r['.tag'] === 'complete') d.status = 'fertig'
      else if (r['.tag'] === 'failed') { d.status = 'fehler'; d.fehler = JSON.stringify(r.failed ?? r).slice(0, 160) }
    } catch (e) {
      d.fehler = (e as Error).message
    }
  }

  const laeuft = dateien.some((d) => d.status === 'laeuft' || d.status === 'offen')
  const fehler = dateien.filter((d) => d.status === 'fehler').length
  const status = laeuft ? 'laeuft' : fehler === dateien.length ? 'fehler' : 'fertig'
  if (!laeuft && fehler) notiz = [notiz, `${fehler} Datei(en) fehlgeschlagen`].filter(Boolean).join(' · ')
  await admin.from('drive_importe').update({ status, dateien, notiz, updated_at: new Date().toISOString() }).eq('id', imp.id)
  return { id: imp.id, status, fertig: dateien.filter((d) => d.status === 'fertig').length, gesamt: dateien.length, fehler, notiz }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { data } = await admin.from('drive_importe').select('*').in('status', ['neu', 'laeuft']).order('created_at').limit(5)
    const ergebnisse = []
    for (const imp of data ?? []) {
      try {
        ergebnisse.push(await bearbeite(imp))
      } catch (e) {
        const msg = (e as Error).message
        await admin.from('drive_importe').update({ status: 'fehler', notiz: msg, updated_at: new Date().toISOString() }).eq('id', imp.id)
        ergebnisse.push({ id: imp.id, status: 'fehler', notiz: msg })
      }
    }
    return new Response(JSON.stringify({ ergebnisse }), { headers: { ...CORS, 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }
})
