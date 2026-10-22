// Supabase Edge Function: automatik-start
// -------------------------------------------------------------------------
// Startet die Schnitt-Automatik (Claude-Routine auf dem Schnitt-PC) genau
// dann, wenn es Arbeit gibt: nach "Drehtag abschliessen" und nach "Aendern"
// in der Freigabe. Kein stuendliches Leerlaufen mehr noetig.
//
// Schutz vor Doppelstarts:
//   - laeuft schon ein Auftrag / eine Aenderung (jünger als 45 Min.) -> kein Start;
//     der laufende Lauf nimmt neue Arbeit am Ende selbst mit
//   - letzter Start juenger als 10 Min. -> kein Start (Tabelle automatik_starts)
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   ROUTINE_ID          optional, Standard: trig_016S6ostZ4JciCjKyEzkK1ob (Schnitt-Automatik)
//   ROUTINE_FIRE_TOKEN  sk-ant-oat01-... (claude.ai/code/routines -> Routine -> Bearbeiten
//                       -> Trigger hinzufuegen -> API -> Token erzeugen)
// Fehlt der Token, passiert nichts (Antwort gestartet:false).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ROUTINE_ID = Deno.env.get('ROUTINE_ID') || 'trig_016S6ostZ4JciCjKyEzkK1ob'  // Schnitt-Automatik
const TOKEN = Deno.env.get('ROUTINE_FIRE_TOKEN') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE)

function antwort(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const nutzer = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await nutzer.auth.getUser()
    if (!user) return antwort({ error: 'Nicht angemeldet' }, 401)

    const body = await req.json().catch(() => ({}))
    const anlass = String(body.anlass ?? 'Neue Arbeit').slice(0, 500)

    if (!TOKEN || !ROUTINE_ID) return antwort({ gestartet: false, grund: 'Automatik-Start ist noch nicht eingerichtet (Token fehlt)' })

    const grenze = new Date(Date.now() - 45 * 60_000).toISOString()
    const [a, b, c] = await Promise.all([
      admin.from('produktion_auftraege').select('id', { count: 'exact', head: true }).eq('status', 'laeuft').gt('updated_at', grenze).is('deleted_at', null),
      admin.from('video_aenderungen').select('id', { count: 'exact', head: true }).eq('status', 'laeuft').gt('updated_at', grenze).is('deleted_at', null),
      admin.from('automatik_starts').select('created_at').eq('ok', true).order('created_at', { ascending: false }).limit(1),
    ])
    if ((a.count ?? 0) + (b.count ?? 0) > 0) return antwort({ gestartet: false, grund: 'Läuft schon – wird mitgenommen' })
    const letzter = c.data?.[0]?.created_at as string | undefined
    if (letzter && Date.now() - new Date(letzter).getTime() < 10 * 60_000) {
      return antwort({ gestartet: false, grund: 'Gerade erst gestartet – wird mitgenommen' })
    }

    const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${ROUTINE_ID}/fire`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: `Gestartet aus dem CRM. Anlass: ${anlass}` }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const grund = (j as any)?.error?.message ?? `HTTP ${res.status}`
      await admin.from('automatik_starts').insert({ anlass, ok: false, fehler: grund })
      return antwort({ gestartet: false, grund: 'Start abgelehnt: ' + grund })
    }
    await admin.from('automatik_starts').insert({ anlass, ok: true, session_url: (j as any)?.claude_code_session_url ?? null })
    return antwort({ gestartet: true })
  } catch (e) {
    return antwort({ error: (e as Error).message }, 500)
  }
})
