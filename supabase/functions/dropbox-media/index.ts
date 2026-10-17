// Supabase Edge Function: dropbox-media
// -------------------------------------------------------------------------
// Das Dashboard als Oberflaeche vor unserer Dropbox. Die Dateien bleiben in
// Dropbox -- diese Funktion listet, sucht, zeigt Vorschauen, liefert
// Abspiel-Links und verschiebt. Alles, was hier verschoben wird, ist sofort
// auch in Dropbox (und auf dem PC) verschoben: es gibt nur einen Bestand.
//
// Einrichtung (einmalig):
//   1. dropbox.com/developers/apps -> "Create app" -> Scoped access ->
//      Full Dropbox. Unter "Permissions" anhaken: files.metadata.read,
//      files.content.read, files.content.write -> Submit.
//   2. In Supabase -> Edge Functions -> Secrets eintragen:
//        DROPBOX_APP_KEY      (App key)
//        DROPBOX_APP_SECRET   (App secret)
//   3. Im Dashboard unter Produktion -> Medien auf "Dropbox verbinden".
//      Der Refresh-Token landet in der Tabelle dropbox_verbindung, die nur
//      diese Funktion lesen kann.
//
// "Enforce JWT" AN lassen. Zusaetzlich prueft die Funktion, dass ein
// eingeloggter Nutzer anfragt -- der oeffentliche anon-Schluessel reicht nicht.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Nur innerhalb des Agentur-Ordners. Private Ordner (Kamera-Uploads,
// "Fassie Creator") bleiben aus dem Dashboard heraus.
const BASIS = '/Sow & Loynab Media'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_KEY = Deno.env.get('DROPBOX_APP_KEY') ?? ''
const APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET') ?? ''

class Fehler extends Error {
  constructor(msg: string, public status = 400) { super(msg) }
}

function antwort(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** Pfad pruefen: muss im Agentur-Ordner liegen, kein "..". */
function sichererPfad(p: unknown): string {
  if (typeof p !== 'string' || !p.trim()) throw new Fehler('Pfad fehlt')
  const pfad = p.trim().normalize('NFC').replace(/\/+$/, '')
  if (pfad.split('/').includes('..')) throw new Fehler('Ungültiger Pfad')
  const klein = pfad.toLowerCase()
  if (klein !== BASIS.toLowerCase() && !klein.startsWith(BASIS.toLowerCase() + '/')) {
    throw new Fehler('Nur Ordner unter „Sow & Loynab Media“ sind erlaubt', 403)
  }
  return pfad
}

// ---- Dropbox-Zugang ------------------------------------------------------

const admin = createClient(SUPABASE_URL, SERVICE)
let cache: { token: string; bis: number } | null = null

async function accessToken(): Promise<string> {
  if (cache && cache.bis > Date.now() + 60_000) return cache.token
  if (!APP_KEY || !APP_SECRET) throw new Fehler('Dropbox-App fehlt: DROPBOX_APP_KEY und DROPBOX_APP_SECRET in Supabase eintragen', 412)
  const { data } = await admin.from('dropbox_verbindung').select('refresh_token').eq('id', 1).maybeSingle()
  if (!data?.refresh_token) throw new Fehler('Dropbox ist noch nicht verbunden', 412)
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: data.refresh_token,
      client_id: APP_KEY, client_secret: APP_SECRET,
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Fehler('Dropbox-Anmeldung abgelaufen — bitte neu verbinden (' + (j.error_description ?? j.error ?? res.status) + ')', 412)
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
  try { j = JSON.parse(text) } catch { /* Fehlertext ist manchmal kein JSON */ }
  if (!res.ok) {
    const grund = j?.error_summary ?? text.slice(0, 200)
    if (String(grund).includes('not_found')) throw new Fehler('Ordner oder Datei nicht gefunden', 404)
    throw new Fehler('Dropbox: ' + grund, 502)
  }
  return j
}

// ---- Eintraege vereinheitlichen ------------------------------------------

const VIDEO = /\.(mp4|mov|m4v|avi|mkv|webm|mts|hevc)$/i
const BILD = /\.(jpe?g|png|heic|heif|gif|webp|tiff?|bmp)$/i

function art(name: string): 'video' | 'bild' | 'datei' {
  if (VIDEO.test(name)) return 'video'
  if (BILD.test(name)) return 'bild'
  return 'datei'
}

function eintrag(e: any) {
  const ordner = e['.tag'] === 'folder'
  return {
    name: e.name as string,
    pfad: (e.path_display ?? e.path_lower) as string,
    ordner,
    art: ordner ? 'ordner' : art(e.name),
    groesse: ordner ? null : (e.size ?? null),
    geaendert: ordner ? null : (e.client_modified ?? e.server_modified ?? null),
  }
}

// Programm-Ordner von Premiere & Co. sind fuer uns Rauschen.
function sichtbar(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('Adobe Premiere Pro')
}

// ---- Aktionen ------------------------------------------------------------

async function liste(pfad: string, rekursiv = false) {
  const out: any[] = []
  let r = await rpc('files/list_folder', { path: pfad, recursive: rekursiv, limit: 500 })
  out.push(...r.entries)
  // Grosse Ordner seitenweise -- aber mit Obergrenze, damit nichts haengt.
  while (r.has_more && out.length < 3000) {
    r = await rpc('files/list_folder/continue', { cursor: r.cursor })
    out.push(...r.entries)
  }
  return out
    .filter((e) => e['.tag'] !== 'deleted' && sichtbar(e.name))
    .filter((e) => !rekursiv || !String(e.path_display ?? '').includes('/Adobe Premiere Pro'))
    .map(eintrag)
}

async function vorschauen(pfade: string[]) {
  const entries = pfade.slice(0, 25).map((p) => ({
    path: sichererPfad(p), format: 'jpeg', size: 'w256h256', mode: 'fitone_bestfit',
  }))
  if (!entries.length) return []
  const r = await rpc('files/get_thumbnail_batch', { entries })
  return (r.entries ?? []).map((e: any, i: number) => ({
    pfad: pfade[i],
    bild: e['.tag'] === 'success' ? `data:image/jpeg;base64,${e.thumbnail}` : null,
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Nur eingeloggte Team-Mitglieder.
    const nutzer = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await nutzer.auth.getUser()
    if (!user) throw new Fehler('Nicht angemeldet', 401)

    const body = await req.json().catch(() => ({}))

    switch (body.action) {
      case 'status': {
        const { data } = await admin.from('dropbox_verbindung').select('konto, verbunden_am').eq('id', 1).maybeSingle()
        return antwort({ appEingerichtet: !!(APP_KEY && APP_SECRET), verbunden: !!data, konto: data?.konto ?? null })
      }

      case 'auth-url': {
        if (!APP_KEY) throw new Fehler('DROPBOX_APP_KEY fehlt in den Supabase-Secrets', 412)
        const url = new URL('https://www.dropbox.com/oauth2/authorize')
        url.searchParams.set('client_id', APP_KEY)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('token_access_type', 'offline')
        return antwort({ url: url.toString() })
      }

      case 'connect': {
        const code = String(body.code ?? '').trim()
        if (!code) throw new Fehler('Code fehlt')
        if (!APP_KEY || !APP_SECRET) throw new Fehler('Dropbox-App-Secrets fehlen in Supabase', 412)
        const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: APP_KEY, client_secret: APP_SECRET }),
        })
        const j = await res.json()
        if (!res.ok || !j.refresh_token) throw new Fehler('Code abgelehnt — bitte neu holen (' + (j.error_description ?? j.error ?? res.status) + ')')
        cache = { token: j.access_token, bis: Date.now() + (j.expires_in ?? 14400) * 1000 }
        let konto: string | null = null
        try {
          const me = await rpc('users/get_current_account', null)
          konto = me?.name?.display_name ?? me?.email ?? null
        } catch { /* Name ist nur Komfort */ }
        const { error } = await admin.from('dropbox_verbindung')
          .upsert({ id: 1, refresh_token: j.refresh_token, konto, verbunden_am: new Date().toISOString() })
        if (error) throw new Fehler('Konnte Verbindung nicht speichern: ' + error.message, 500)
        return antwort({ ok: true, konto })
      }

      case 'list':
        return antwort({ eintraege: await liste(sichererPfad(body.pfad)) })

      case 'folders': {
        // Alle Unterordner eines Kunden -- fuer "Verschieben nach ...".
        const alle = await liste(sichererPfad(body.pfad), true)
        return antwort({ ordner: alle.filter((e) => e.ordner).map((e) => e.pfad).sort() })
      }

      case 'thumbs':
        return antwort({ vorschauen: await vorschauen(Array.isArray(body.pfade) ? body.pfade : []) })

      case 'link': {
        const r = await rpc('files/get_temporary_link', { path: sichererPfad(body.pfad) })
        return antwort({ url: r.link })
      }

      case 'search': {
        const q = String(body.query ?? '').trim()
        if (q.length < 2) return antwort({ eintraege: [] })
        const r = await rpc('files/search_v2', {
          query: q,
          options: { path: sichererPfad(body.pfad ?? BASIS), max_results: 60, file_status: 'active', filename_only: false },
        })
        const treffer = (r.matches ?? [])
          .map((m: any) => m.metadata?.metadata)
          .filter((e: any) => e && sichtbar(e.name) && !String(e.path_display ?? '').includes('/Adobe Premiere Pro'))
          .map(eintrag)
        return antwort({ eintraege: treffer })
      }

      case 'move': {
        const ziel = sichererPfad(body.nach)
        const pfade: string[] = (Array.isArray(body.pfade) ? body.pfade : []).map(sichererPfad)
        if (!pfade.length) throw new Fehler('Nichts ausgewählt')
        const ergebnis: { pfad: string; ok: boolean; neu?: string; fehler?: string }[] = []
        for (const p of pfade) {
          const name = p.split('/').pop()!
          try {
            const r = await rpc('files/move_v2', { from_path: p, to_path: `${ziel}/${name}`, autorename: true })
            ergebnis.push({ pfad: p, ok: true, neu: r.metadata?.path_display })
          } catch (e) {
            ergebnis.push({ pfad: p, ok: false, fehler: (e as Error).message })
          }
        }
        return antwort({ ergebnis })
      }

      case 'mkdir': {
        const r = await rpc('files/create_folder_v2', { path: sichererPfad(body.pfad), autorename: false })
        return antwort({ pfad: r.metadata?.path_display })
      }

      default:
        throw new Fehler('Unbekannte Aktion')
    }
  } catch (e) {
    const f = e instanceof Fehler ? e : new Fehler((e as Error).message ?? 'Fehler', 500)
    return antwort({ error: f.message }, f.status)
  }
})
