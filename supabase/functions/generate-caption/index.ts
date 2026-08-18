// Supabase Edge Function: generate-caption
// Erzeugt aus einer Ein-Satz-Beschreibung + Kundendaten eine fertige
// Social-Media-Caption + Hashtags via Claude. Der API-Key bleibt server-seitig
// (Secret ANTHROPIC_API_KEY) und landet NIE im Frontend.
//
// Deploy: Supabase-Dashboard -> Edge Functions -> "generate-caption" anlegen,
// diesen Code einfuegen, deployen. Secret setzen:
//   Edge Functions -> Secrets -> ANTHROPIC_API_KEY = dein Anthropic-Key.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  description: string
  client?: { name?: string; handle_ig?: string | null; handle_tiktok?: string | null }
  notes?: string | null
  extra?: string | null // optionale Zusatzwuensche vom Nutzer
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)
    }

    const body = (await req.json()) as Body
    const description = (body.description ?? '').trim()
    if (!description) return json({ error: 'Bitte das Video in einem Satz beschreiben.' }, 400)

    const c = body.client ?? {}
    const kontext = [
      c.name ? `Restaurant/Kunde: ${c.name}` : null,
      c.handle_ig ? `Instagram: @${c.handle_ig.replace(/^@/, '')}` : null,
      c.handle_tiktok ? `TikTok: @${c.handle_tiktok.replace(/^@/, '')}` : null,
      body.notes ? `Notizen: ${body.notes}` : null,
      body.extra ? `Zusatzwunsch: ${body.extra}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const system = [
      'Du bist Social-Media-Redakteur einer Gastronomie-Agentur aus Münster.',
      'Schreibe eine deutsche Caption für ein Instagram-/TikTok-Reel eines Restaurants.',
      'Stil: locker, appetitanregend, authentisch, nicht werblich-übertrieben. Kurze Sätze.',
      'Nutze 1–3 passende Emojis (nicht mehr). Sprich die lokale Zielgruppe an.',
      'Gib danach 6–10 relevante Hashtags aus (Mix aus Food-, Nischen- und lokalen',
      'Hashtags wie #münster #foodmünster). Wenn ein Instagram-Handle bekannt ist,',
      'baue ihn dezent ein.',
      'Format der Antwort GENAU so:',
      'Zuerst der Caption-Text (2–4 Zeilen).',
      'Dann eine Leerzeile.',
      'Dann die Hashtags in einer Zeile.',
      'Keine Vorrede, keine Anführungszeichen, keine Erklärungen — nur das Ergebnis.',
    ].join(' ')

    const userMsg = `Beschreibung des Videos: ${description}\n\n${kontext}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `Claude-API-Fehler (${resp.status}): ${detail.slice(0, 300)}` }, 502)
    }

    const data = await resp.json()
    const caption = (data?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim()

    return json({ caption })
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
