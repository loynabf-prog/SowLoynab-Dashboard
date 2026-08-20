// Supabase Edge Function: send-push
// -------------------------------------------------------------------------
// Schickt eine echte Handy-Push-Benachrichtigung an alle Geräte einer Person.
// Aufgerufen vom Frontend beim Anstupsen (lib/nudge.ts).
//
// Benötigt Secrets (Supabase -> Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY   – öffentlicher VAPID-Schlüssel (gleicher wie im Frontend)
//   VAPID_PRIVATE_KEY  – privater VAPID-Schlüssel
//   VAPID_SUBJECT      – z. B. mailto:loynabf@gmail.com
// (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sind automatisch vorhanden.)
//
// VAPID-Schlüsselpaar erzeugen: siehe Anleitung ("npx web-push generate-vapid-keys").

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:info@sowloynab.de'
    if (!pub || !priv) return json({ error: 'VAPID-Schlüssel fehlen (Secrets).' }, 500)

    webpush.setVapidDetails(subject, pub, priv)

    const { member_id, title, body, link } = await req.json()
    if (!member_id) return json({ error: 'member_id fehlt.' }, 400)

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: subs, error } = await supa
      .from('push_subscriptions')
      .select('*')
      .eq('member_id', member_id)
    if (error) return json({ error: error.message }, 500)

    const payload = JSON.stringify({ title: title || 'Anstupser', body: body || '', link: link || '/' })

    let sent = 0
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        sent++
      } catch (e: any) {
        // Abgelaufenes/ungültiges Abo entfernen
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supa.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }
    return json({ sent })
  } catch (err) {
    return json({ error: `Unerwarteter Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}
