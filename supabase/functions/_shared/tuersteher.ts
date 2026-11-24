// Türsteher für alle Edge Functions (Sicherheit, 24.11.2026).
// Durch kommen nur:
//   1. eingeloggte Nutzer des CRM (echter Login, nicht der öffentliche App-Schlüssel)
//   2. Server-Aufrufe mit dem Service-Role-Schlüssel (Funktionen untereinander)
//   3. Zeitpläne/Datenbank mit dem geheimen Ausweis (Header x-cron-secret,
//      liegt im Vault als "cron_secret", Zeitpläne holen ihn über public.cron_kopf())
// Alle anderen bekommen 401 – auch wer nur den öffentlichen anon key kennt.
//
// Einbau:   const nein = await tuersteher(req); if (nein) return nein
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export async function tuersteher(req: Request): Promise<Response | null> {
  if (req.method === 'OPTIONS') return null
  const url = Deno.env.get('SUPABASE_URL')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()

  if (token && token === service) return null

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  const ausweis = req.headers.get('x-cron-secret')
  if (ausweis) {
    const { data } = await admin.rpc('cron_ausweis_pruefen', { s: ausweis })
    if (data === true) return null
  }

  if (token) {
    const { data } = await admin.auth.getUser(token)
    if (data?.user) return null
  }

  return new Response(JSON.stringify({ error: 'Kein Zutritt' }), {
    status: 401,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}
