// Supabase Edge Function: mail-sync
// -------------------------------------------------------------------------
// Holt neue Mails aus dem Zoho-Posteingang und schreibt sie in die Tabelle
// "mails". Das Postfach in der App liest nur aus dieser Tabelle (schnell,
// Realtime, offline-fähig). Gedacht für einen häufigen Cron-Aufruf
// (z. B. alle 5 Minuten, siehe cron-setup.sql). Kann auch aus der App per
// "Aktualisieren"-Knopf angestoßen werden.
//
// Secrets: dieselben wie mail-send
//   ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN
//   ZOHO_ACCOUNT_ID (optional), ZOHO_MAIL_BASE, ZOHO_ACCOUNTS_BASE (optional)
//
// Beim Deploy: "Enforce JWT" AUSschalten (der Cron ruft die Funktion).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAIL_BASE = Deno.env.get('ZOHO_MAIL_BASE') || 'https://mail.zoho.eu'
const ACCOUNTS_BASE = Deno.env.get('ZOHO_ACCOUNTS_BASE') || 'https://accounts.zoho.eu'
const HDR = (t: string) => ({ Authorization: `Zoho-oauthtoken ${t}` })

async function accessToken(): Promise<string> {
  const rt = Deno.env.get('ZOHO_REFRESH_TOKEN'); const cid = Deno.env.get('ZOHO_CLIENT_ID'); const cs = Deno.env.get('ZOHO_CLIENT_SECRET')
  if (!rt || !cid || !cs) throw new Error('Zoho-Secrets fehlen.')
  const url = `${ACCOUNTS_BASE}/oauth/v2/token?refresh_token=${encodeURIComponent(rt)}&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(cs)}&grant_type=refresh_token`
  const j = await (await fetch(url, { method: 'POST' })).json().catch(() => ({}))
  if (!j.access_token) throw new Error('Zoho-Token: ' + JSON.stringify(j).slice(0, 200))
  return j.access_token
}
async function accountId(t: string): Promise<string> {
  const fixed = Deno.env.get('ZOHO_ACCOUNT_ID'); if (fixed) return fixed
  const j = await (await fetch(`${MAIL_BASE}/api/accounts`, { headers: HDR(t) })).json().catch(() => ({}))
  const id = j?.data?.[0]?.accountId; if (!id) throw new Error('Zoho-Konto: ' + JSON.stringify(j).slice(0, 200))
  return String(id)
}
async function inboxFolderId(t: string, acc: string): Promise<string> {
  const j = await (await fetch(`${MAIL_BASE}/api/accounts/${acc}/folders`, { headers: HDR(t) })).json().catch(() => ({}))
  const list: any[] = j?.data ?? []
  const inbox = list.find((f) => (f.folderName || '').toLowerCase() === 'inbox') || list.find((f) => (f.path || '').toLowerCase() === '/inbox')
  if (!inbox?.folderId) throw new Error('Inbox-Ordner nicht gefunden: ' + JSON.stringify(list).slice(0, 200))
  return String(inbox.folderId)
}

// "Name <a@b.de>" -> { name, addr }
function splitFrom(s: string): { name: string; addr: string } {
  if (!s) return { name: '', addr: '' }
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim(), addr: m[2].trim() }
  return { name: '', addr: s.trim() }
}
function toISO(v: any): string {
  const n = Number(v)
  if (!isNaN(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString()
  const d = new Date(v); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const t = await accessToken()
    const acc = await accountId(t)
    const folderId = await inboxFolderId(t, acc)

    const listUrl = `${MAIL_BASE}/api/accounts/${acc}/messages/view?folderId=${folderId}&limit=25&start=1`
    const lj = await (await fetch(listUrl, { headers: HDR(t) })).json().catch(() => ({}))
    const msgs: any[] = lj?.data ?? []

    // schon vorhandene IDs überspringen
    const ids = msgs.map((m) => String(m.messageId)).filter(Boolean)
    const existing = new Set<string>()
    if (ids.length) {
      const { data } = await supa.from('mails').select('zoho_message_id').in('zoho_message_id', ids)
      for (const r of data ?? []) existing.add(String(r.zoho_message_id))
    }

    let imported = 0
    for (const m of msgs) {
      const mid = String(m.messageId)
      if (!mid || existing.has(mid)) continue
      const { name, addr } = splitFrom(m.fromAddress || m.sender || '')
      // vollen Inhalt holen
      let html = ''
      try {
        const cj = await (await fetch(`${MAIL_BASE}/api/accounts/${acc}/folders/${folderId}/messages/${mid}/content`, { headers: HDR(t) })).json().catch(() => ({}))
        html = cj?.data?.content || ''
      } catch { /* Inhalt später nachladbar */ }

      const row = {
        zoho_message_id: mid,
        folder: 'Inbox',
        from_address: addr,
        from_name: name || m.sender || '',
        to_address: m.toAddress || '',
        subject: m.subject || '(kein Betreff)',
        snippet: (m.summary || '').slice(0, 300),
        body_html: html,
        received_at: toISO(m.receivedTime || m.sentDateInGMT),
        is_read: String(m.status) === '1' || m.isRead === true ? true : false,
      }
      const { error } = await supa.from('mails').upsert(row, { onConflict: 'zoho_message_id' })
      if (!error) imported++
    }

    return json({ ok: true, checked: msgs.length, imported })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
