// Supabase Edge Function: mail-send
// -------------------------------------------------------------------------
// Verschickt eine E-Mail (z. B. eine Rechnung als PDF-Anhang) DIREKT über
// euer Zoho-Postfach — Absender bleibt eure @sowloynab.de-Adresse, die Mail
// landet in eurem Zoho-"Gesendet".
//
// Aufruf aus der App (eingeloggt): supabase.functions.invoke('mail-send', { body })
//   body = { to, subject, html, attachments?: [{ filename, mime, base64 }] }
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   ZOHO_CLIENT_ID       – aus der Zoho API Console
//   ZOHO_CLIENT_SECRET   – aus der Zoho API Console
//   ZOHO_REFRESH_TOKEN   – einmalig erzeugter Refresh-Token (läuft nicht ab)
//   ZOHO_FROM_ADDRESS    – Absenderadresse, z. B. rechnung@sowloynab.de
//   ZOHO_ACCOUNT_ID      – optional (spart einen API-Call; sonst automatisch)
//   ZOHO_MAIL_BASE       – optional, Default https://mail.zoho.eu
//   ZOHO_ACCOUNTS_BASE   – optional, Default https://accounts.zoho.eu
//
// Beim Deploy: "Enforce JWT" AN lassen (nur eingeloggtes Team darf senden).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAIL_BASE = Deno.env.get('ZOHO_MAIL_BASE') || 'https://mail.zoho.eu'
const ACCOUNTS_BASE = Deno.env.get('ZOHO_ACCOUNTS_BASE') || 'https://accounts.zoho.eu'

async function accessToken(): Promise<string> {
  const rt = Deno.env.get('ZOHO_REFRESH_TOKEN')
  const cid = Deno.env.get('ZOHO_CLIENT_ID')
  const cs = Deno.env.get('ZOHO_CLIENT_SECRET')
  if (!rt || !cid || !cs) throw new Error('Zoho-Secrets fehlen (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN).')
  const url = `${ACCOUNTS_BASE}/oauth/v2/token?refresh_token=${encodeURIComponent(rt)}&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(cs)}&grant_type=refresh_token`
  const r = await fetch(url, { method: 'POST' })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error('Zoho-Token fehlgeschlagen: ' + JSON.stringify(j).slice(0, 200))
  return j.access_token as string
}

async function accountId(access: string): Promise<string> {
  const fixed = Deno.env.get('ZOHO_ACCOUNT_ID')
  if (fixed) return fixed
  const r = await fetch(`${MAIL_BASE}/api/accounts`, { headers: { Authorization: `Zoho-oauthtoken ${access}` } })
  const j = await r.json().catch(() => ({}))
  const id = j?.data?.[0]?.accountId
  if (!id) throw new Error('Zoho-Konto nicht gefunden: ' + JSON.stringify(j).slice(0, 200))
  return String(id)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function uploadAttachment(access: string, acc: string, att: { filename: string; mime: string; base64: string }) {
  const url = `${MAIL_BASE}/api/accounts/${acc}/messages/attachments?fileName=${encodeURIComponent(att.filename)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${access}`, 'Content-Type': att.mime || 'application/octet-stream' },
    body: b64ToBytes(att.base64),
  })
  const j = await r.json().catch(() => ({}))
  const d = j?.data
  const ref = Array.isArray(d) ? d[0] : d
  if (!ref?.storeName) throw new Error('Anhang-Upload fehlgeschlagen: ' + JSON.stringify(j).slice(0, 200))
  return { storeName: ref.storeName, attachmentName: ref.attachmentName || att.filename, attachmentPath: ref.attachmentPath }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { to, subject, html, attachments } = await req.json()
    if (!to || !subject) return json({ error: 'to und subject sind Pflicht.' }, 400)

    const from = Deno.env.get('ZOHO_FROM_ADDRESS')
    if (!from) throw new Error('ZOHO_FROM_ADDRESS ist nicht gesetzt.')

    const access = await accessToken()
    const acc = await accountId(access)

    const uploaded: any[] = []
    for (const att of (attachments ?? [])) {
      uploaded.push(await uploadAttachment(access, acc, att))
    }

    const body: Record<string, unknown> = {
      fromAddress: from,
      toAddress: to,
      subject,
      content: html || '',
      mailFormat: 'html',
    }
    if (uploaded.length) body.attachments = uploaded

    const r = await fetch(`${MAIL_BASE}/api/accounts/${acc}/messages`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || (j?.status?.code && j.status.code !== 200)) {
      throw new Error('Zoho-Versand fehlgeschlagen: ' + JSON.stringify(j).slice(0, 300))
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
