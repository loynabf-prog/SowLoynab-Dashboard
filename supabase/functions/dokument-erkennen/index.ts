// Supabase Edge Function: dokument-erkennen
// ---------------------------------------------------------------------------
// Fassie (08.11.2026): "Ich scanne ein Dokument, du schaust dir an, was das ist,
// und hinterlegst es passend mit Namen."
//
// Ablauf: Die App laedt die Datei in den Bucket "dokumente" und legt die Zeile
// mit erkennung = 'laeuft' an. Dann ruft sie diese Function mit { id } auf:
//   1. Datei aus dem Bucket holen
//   2. Claude liest sie (Bild oder PDF) und liefert Titel, Kategorie, Absender,
//      Datum, Zusammenfassung, Frist, wen es betrifft
//   3. Zeile aktualisieren
//   4. Gibt es eine Frist mit Handlungsbedarf -> Aufgabe (Erinnerung) anlegen
//   5. Rechnung/Beleg der Agentur -> zusaetzlich in den Dropbox-Buchhaltungs-
//      eingang (/Sow & Loynab Media/Agentur/Buchhaltung/Eingang)
// Schritte 4 und 5 duerfen scheitern, ohne dass die Erkennung scheitert.
//
// Secrets: ANTHROPIC_API_KEY (schon vorhanden), fuer Dropbox DROPBOX_APP_KEY /
// DROPBOX_APP_SECRET + Tabelle dropbox_verbindung (wie dropbox-media).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE)

const KATEGORIEN = ['behoerde', 'steuer', 'vertrag', 'versicherung', 'bank', 'rechnung', 'vorlage', 'privat', 'sonstiges'] as const
const BETRIFFT = ['agentur', 'fassie', 'lion'] as const
const BUCHHALTUNG_EINGANG = '/Sow & Loynab Media/Agentur/Buchhaltung/Eingang'
const MAX_BYTES = 20 * 1024 * 1024

function antwort(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function heuteBerlin(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function datumOk(s: unknown): string | null {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

const SYSTEM = `Du sortierst Post und Dokumente für „Sow & Loynab Media“, eine Social-Media-Agentur (GbR) in Münster.
Gesellschafter: Fassie Loynab und Lion Sow. Adresse von Fassie: Heinrich-Ebel-Str. 11, 48161 Münster.

Lies das Dokument genau und antworte NUR mit einem JSON-Objekt (keine Vorrede, kein Markdown):
{
  "titel": "kurzer, sprechender Name zum Wiederfinden: <Art> – <Absender/Gegenstand> – <Zeitraum oder Datum>, z. B. „Gewerbeanmeldung – Stadt Münster – 08/2026“, „Umsatzsteuer-ID Bestätigung – Bundeszentralamt für Steuern“, „Rechnung ElevenLabs – Oktober 2026“, „Mahnung Rundfunkbeitrag – 11/2026“. Max. 70 Zeichen, deutsch.",
  "kategorie": "eine von: behoerde (Gewerbeamt, Stadt, IHK, Handelsregister, Rundfunkbeitrag, Bescheide von Ämtern außer Finanzamt), steuer (Finanzamt, Steuernummer, USt-ID, Steuerbescheide, Steuerberater, Elster), vertrag (Verträge, AGB, Kündigungen, Abos), versicherung (Policen, Krankenversicherung, Haftpflicht, Beitragsschreiben), bank (Bank, Konto, Karten, Kredite), rechnung (Rechnungen, Quittungen, Belege, Kassenbons – egal ob an uns oder von uns), vorlage (Vorlagen, Briefpapier, Muster), privat (rein private Post ohne Agenturbezug), sonstiges",
  "betrifft": "agentur | fassie | lion – an wen/worum es geht. Agentur, wenn an die GbR/Sow & Loynab Media oder geschäftlich; fassie bzw. lion, wenn eindeutig persönlich an diese Person",
  "absender": "wer das Dokument ausgestellt/geschickt hat, kurz",
  "dokument_datum": "YYYY-MM-DD oder null",
  "zusammenfassung": "2–3 kurze Sätze: worum geht es, was steht drin. Danach in einer Zeile alle wichtigen Nummern/Beträge, z. B. „Steuernummer 337/5xxx/xxxx · Aktenzeichen … · Betrag 89,00 €“. Nur was wirklich draufsteht.",
  "notiz": "eine Zeile für die Listenansicht, z. B. „Finanzamt Münster-Innenstadt · 03.11.2026“",
  "gueltig_bis": "YYYY-MM-DD, wenn das Dokument ein Ablauf-/Gültigkeitsdatum hat (Ausweis, Police, Vertrag mit Enddatum), sonst null",
  "frist": "YYYY-MM-DD, wenn bis zu einem Datum etwas zu tun ist (zahlen, antworten, Unterlagen einreichen, widersprechen, kündigen). Steht nur „innerhalb von 14 Tagen“, rechne ab dokument_datum. Sonst null",
  "handlung": "wenn frist gesetzt: was genau zu tun ist, ein kurzer Satz im Imperativ (z. B. „89 € an Beitragsservice überweisen“). Sonst null"
}
Wenn das Bild unscharf oder kein Dokument ist, trotzdem dein bestes JSON, und in der zusammenfassung sagen, was man erkennt.`

interface Ergebnis {
  titel?: string; kategorie?: string; betrifft?: string; absender?: string; dokument_datum?: string | null
  zusammenfassung?: string; notiz?: string; gueltig_bis?: string | null; frist?: string | null; handlung?: string | null
}

async function claudeLesen(key: string, block: unknown, dateiname: string): Promise<Ergebnis> {
  const text = `Heute ist ${heuteBerlin()}. Dateiname: ${dateiname}. Was ist das für ein Dokument?`
  let letzterFehler = ''
  for (const model of ['claude-sonnet-4-5', 'claude-haiku-4-5']) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 1200, system: SYSTEM,
        messages: [{ role: 'user', content: [block, { type: 'text', text }] }],
      }),
    })
    if (!res.ok) { letzterFehler = `Claude ${res.status}: ${(await res.text()).slice(0, 200)}`; continue }
    const j = await res.json()
    const roh = (j?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const m = roh.match(/\{[\s\S]*\}/)
    if (!m) { letzterFehler = 'Claude hat kein JSON geliefert'; continue }
    try { return JSON.parse(m[0]) as Ergebnis } catch { letzterFehler = 'JSON nicht lesbar' }
  }
  throw new Error(letzterFehler || 'Claude nicht erreichbar')
}

// ---- Dropbox (nur fuer Rechnungen) ----------------------------------------

async function dropboxToken(): Promise<string | null> {
  const appKey = Deno.env.get('DROPBOX_APP_KEY'); const appSecret = Deno.env.get('DROPBOX_APP_SECRET')
  if (!appKey || !appSecret) return null
  const { data } = await admin.from('dropbox_verbindung').select('refresh_token').eq('id', 1).maybeSingle()
  if (!data?.refresh_token) return null
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token, client_id: appKey, client_secret: appSecret }),
  })
  if (!res.ok) return null
  return (await res.json()).access_token ?? null
}

/** Dropbox-API-Arg muss reines ASCII sein -> Umlaute als \uXXXX. */
function asciiJson(o: unknown): string {
  return JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

function dateiSicher(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90)
}

async function inBuchhaltung(bytes: Uint8Array, titel: string, datum: string, endung: string): Promise<string | null> {
  const token = await dropboxToken()
  if (!token) return null
  const pfad = `${BUCHHALTUNG_EINGANG}/${datum} ${dateiSicher(titel)}.${endung}`.normalize('NFC')
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': asciiJson({ path: pfad, mode: 'add', autorename: true, mute: true }),
    },
    body: bytes,
  })
  if (!res.ok) { console.error('Dropbox-Upload', res.status, await res.text()); return null }
  const j = await res.json()
  return j.path_display ?? pfad
}

// ---- Hauptteil --------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  let id: string | null = null
  try {
    // nur angemeldete Teammitglieder
    const auth = req.headers.get('Authorization') ?? ''
    const nutzer = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })
    const { data: u } = await nutzer.auth.getUser()
    if (!u?.user) return antwort({ error: 'Nicht angemeldet' }, 401)

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return antwort({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)

    const body = await req.json().catch(() => ({}))
    id = typeof body.id === 'string' ? body.id : null
    if (!id) return antwort({ error: 'id fehlt' }, 400)

    const { data: dok, error } = await admin.from('dokumente').select('*').eq('id', id).maybeSingle()
    if (error || !dok) return antwort({ error: 'Dokument nicht gefunden' }, 404)

    await admin.from('dokumente').update({ erkennung: 'laeuft' }).eq('id', id)

    const { data: blob, error: e2 } = await admin.storage.from('dokumente').download(dok.pfad)
    if (e2 || !blob) throw new Error('Datei nicht lesbar: ' + (e2?.message ?? ''))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) throw new Error('Datei zu groß für die Erkennung (max. 20 MB)')

    const mime: string = dok.mime || blob.type || ''
    const b64 = encodeBase64(bytes)
    let block: unknown
    if (mime === 'application/pdf') block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    else if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) block = { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }
    else throw new Error('Diesen Dateityp kann ich nicht lesen (nur PDF und Fotos) – bitte von Hand benennen')

    const r = await claudeLesen(key, block, dok.dateiname)

    const kategorie = (KATEGORIEN as readonly string[]).includes(r.kategorie ?? '') ? r.kategorie! : 'sonstiges'
    const betrifft = (BETRIFFT as readonly string[]).includes(r.betrifft ?? '') ? r.betrifft! : 'agentur'
    const titel = (r.titel ?? '').trim().slice(0, 120) || dok.dateiname
    const frist = datumOk(r.frist)
    const handlung = frist ? (r.handlung ?? '').trim() || null : null
    const dokDatum = datumOk(r.dokument_datum)

    const patch: Record<string, unknown> = {
      titel, kategorie, betrifft,
      absender: (r.absender ?? '').trim() || null,
      dokument_datum: dokDatum,
      inhalt: (r.zusammenfassung ?? '').trim() || null,
      notiz: (r.notiz ?? '').trim() || null,
      gueltig_bis: datumOk(r.gueltig_bis),
      frist, handlung,
      erkennung: 'fertig',
      updated_at: new Date().toISOString(),
    }

    // Frist -> Erinnerung (nur wenn sie nicht schon vorbei ist und noch keine Aufgabe existiert)
    let aufgabe: { id: string; due_date: string } | null = null
    if (frist && frist >= heuteBerlin() && !dok.aufgabe_id) {
      const { data: tm } = await admin.from('team_members').select('id, name')
      const wer = (tm ?? []).find((t: any) => t.name?.toLowerCase() === betrifft)
      const { data: t, error: te } = await admin.from('tasks').insert({
        title: handlung ? `${handlung}` : `Frist: ${titel}`,
        due_date: frist,
        priority: 2,
        notes: `Aus Dokument „${titel}“${r.absender ? ` (${r.absender})` : ''}. Öffnen: Mehr → Geld → Dokumente.`,
        assignee_ids: wer ? [wer.id] : null,
        created_by: u.user.id,
      }).select('id, due_date').single()
      if (te) console.error('Aufgabe', te.message)
      else { aufgabe = t; patch.aufgabe_id = t.id }
    }

    // Rechnung der Agentur -> Dropbox-Buchhaltung
    let dropbox: string | null = null
    if (kategorie === 'rechnung' && betrifft === 'agentur' && !dok.dropbox_pfad) {
      const endung = mime === 'application/pdf' ? 'pdf' : (mime.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
      try { dropbox = await inBuchhaltung(bytes, titel, dokDatum ?? heuteBerlin(), endung) } catch (e) { console.error('Dropbox', e) }
      if (dropbox) patch.dropbox_pfad = dropbox
    }

    const { error: ue } = await admin.from('dokumente').update(patch).eq('id', id)
    if (ue) throw new Error('Speichern ging nicht: ' + ue.message)

    return antwort({ ok: true, titel, kategorie, betrifft, frist, handlung, aufgabe, dropbox })
  } catch (e) {
    if (id) await admin.from('dokumente').update({ erkennung: 'fehler' }).eq('id', id)
    return antwort({ error: (e as Error).message }, 500)
  }
})
