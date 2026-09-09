// Supabase Edge Function: voice-command
// -------------------------------------------------------------------------
// Nimmt einen kurzen Befehl als TEXT entgegen und gibt einen strukturierten
// Vorschlag zurueck (Aufgabe / Lead / Videoidee / KI-Ideen).
//
// Wichtig: Diese Funktion nimmt KEIN Audio mehr entgegen. Frueher ging die
// Sprachaufnahme zur Transkription an OpenAI in die USA -- bei Befehlen, in
// denen staendig Kundennamen fallen, war das die groesste Datenschutz-
// Baustelle im ganzen System. Diktiert wird jetzt mit der Mikrofontaste der
// iPhone-Tastatur: Apple wandelt Sprache in Text um (auf neueren Geraeten
// weitgehend auf dem Geraet selbst), und unser System sieht nur den Text.
// OPENAI_API_KEY wird hier nicht mehr gebraucht.
//
// Secret (Supabase -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  -> fuer Claude (Intent-Erkennung)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Ctx {
  today?: string
  clients?: { id: string; name: string }[]
  leads?: { id: string; name: string }[]
  members?: { id: string; name: string }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)

    const body = await req.json().catch(() => ({}))
    const transcript = String(body?.text ?? '').trim()
    if (!transcript) return json({ error: 'Kein Text empfangen.' }, 400)

    const ctx: Ctx = (body?.context ?? {}) as Ctx

    // ---- 2) Intent-Erkennung via Claude ------------------------------------
    const today = ctx.today || new Date().toISOString().slice(0, 10)
    const clientNames = (ctx.clients ?? []).map((c) => c.name).join(', ') || '(keine)'
    const leadNames = (ctx.leads ?? []).map((l) => l.name).join(', ') || '(keine)'

    const system = [
      'Du bist der Assistent einer Social-Media-Agentur (Sow & Loynab, Münster, Gastronomie).',
      'Der Nutzer spricht einen kurzen Befehl auf Deutsch. Wandle ihn in EIN JSON-Objekt um.',
      `Heutiges Datum: ${today} (nutze es für relative Angaben wie "morgen", "Freitag", "nächste Woche").`,
      `Bekannte Kunden: ${clientNames}.`,
      `Bekannte Leads: ${leadNames}.`,
      '',
      'Antworte AUSSCHLIESSLICH mit purem JSON (kein Markdown, keine Erklärung). Schema:',
      '{',
      '  "type": "task" | "lead" | "video" | "ideas" | "unknown",',
      '  "title": string,            // Aufgabe/Video: kurzer Titel',
      '  "name": string,             // Lead: Name des Betriebs',
      '  "client_name": string|null, // passender Kundenname aus der Liste (oder null)',
      '  "lead_name": string|null,   // passender Leadname aus der Liste (oder null)',
      '  "date": "YYYY-MM-DD"|null,  // Fällig-/Postdatum falls genannt',
      '  "time": "HH:MM"|null,       // Uhrzeit falls genannt',
      '  "count": number|null,       // nur bei type=ideas: wie viele Ideen gewünscht',
      '  "theme": string|null,       // nur bei type=ideas: Schwerpunkt/Thema falls genannt',
      '  "contact_person": string|null,',
      '  "phone": string|null,',
      '  "email": string|null,',
      '  "city": string|null,',
      '  "notes": string|null,       // Rest/Details',
      '  "message": string|null      // nur bei type=unknown: was unklar war',
      '}',
      '',
      'Regeln:',
      '- "Aufgabe", "erinnere mich", "anrufen", "nachfassen" -> type=task.',
      '- "neuer Lead", "Interessent", "Kontakt" mit Betriebsname -> type=lead.',
      '- EINE konkrete "Videoidee", "neues Video", "Reel", "dreh" -> type=video.',
      '- "Gib mir X Videoideen für <Kunde>", "brauche Ideen", "schlag mir Ideen vor" -> type=ideas',
      '  (mehrere Ideen automatisch generieren). count = genannte Zahl (sonst 5), client_name = Kunde.',
      '- Ordne client_name/lead_name nur zu, wenn der Name klar zur Liste passt (Tippfehler-tolerant).',
      '- Felder ohne Angabe = null. Erfinde nichts.',
    ].join('\n')

    const aResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: transcript }],
      }),
    })
    if (!aResp.ok) {
      const detail = await aResp.text()
      // Transkript trotzdem zurueckgeben, damit der Nutzer nicht ganz leer ausgeht
      return json({ transcript, intent: null, error: `Intent-Fehler (${aResp.status}): ${detail.slice(0, 200)}` }, 200)
    }
    const aData = await aResp.json()
    const raw = (aData?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()

    let intent: unknown = null
    try {
      intent = JSON.parse(stripFences(raw))
    } catch {
      intent = { type: 'unknown', message: raw.slice(0, 200) }
    }

    return json({ transcript, intent })
  } catch (err) {
    return json({ error: `Unerwarteter Fehler: ${(err as Error).message}` }, 500)
  }
})

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m ? m[1] : s).trim()
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}
