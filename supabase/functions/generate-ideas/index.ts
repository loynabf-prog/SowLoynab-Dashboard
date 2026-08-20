// Supabase Edge Function: generate-ideas
// -------------------------------------------------------------------------
// Erzeugt aus dem gespeicherten Kunden-Briefing automatisch Videoideen.
// Aufruf per Knopf im Ideenspeicher ODER per Sprachbefehl
// ("Gib mir 5 Videoideen fuer Sahin").
//
// Nutzt ANTHROPIC_API_KEY (Supabase Secret, schon vorhanden von den Captions).
//
// Deploy: Supabase -> Edge Functions -> neue Funktion "generate-ideas",
// diesen Code einfuegen, deployen. Kein weiterer Key noetig.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)

    const body = await req.json().catch(() => ({}))
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 12)
    const theme: string | null = body.theme?.toString().trim() || null
    const client = body.client ?? {}
    const existing: string[] = Array.isArray(body.existing) ? body.existing.slice(0, 40) : []

    const briefParts = [
      client.name && `Betrieb: ${client.name}`,
      client.city && `Ort: ${client.city}`,
      client.ai_brief && `Briefing / Randbedingungen: ${client.ai_brief}`,
      client.brand_notes && `Stil / Do's & Don'ts: ${client.brand_notes}`,
      client.package && `Paket: ${client.package}`,
    ].filter(Boolean).join('\n')

    const system = [
      'Du bist Content-Stratege einer Social-Media-Agentur (Sow & Loynab, Münster) für Gastronomie.',
      'Du entwickelst konkrete, umsetzbare Kurzvideo-Ideen (Reels/TikTok) für einen Kunden.',
      'Jede Idee ist ein kurzer, griffiger Titel + eine knappe Umsetzungs-Notiz (Was zeigen? Warum funktioniert es?).',
      'Ideen müssen realistisch mit dem Handy in einem Gastro-Betrieb drehbar sein. Deutsch.',
      '',
      'Antworte AUSSCHLIESSLICH mit purem JSON (kein Markdown), Schema:',
      '{ "ideas": [ { "title": string, "notes": string } ] }',
      `Genau ${count} Ideen.`,
    ].join('\n')

    const userMsg = [
      briefParts || 'Ein Gastronomie-Betrieb (keine weiteren Angaben).',
      theme ? `\nSchwerpunkt / Thema für diese Ideen: ${theme}` : '',
      existing.length ? `\nBereits vorhandene Ideen (NICHT wiederholen): ${existing.join('; ')}` : '',
      `\nGib mir ${count} frische, unterschiedliche Ideen.`,
    ].join('')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `KI-Fehler (${resp.status}): ${detail.slice(0, 250)}` }, 502)
    }
    const data = await resp.json()
    const raw = (data?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()

    let parsed: any
    try { parsed = JSON.parse(stripFences(raw)) } catch { parsed = null }
    const ideas = Array.isArray(parsed?.ideas)
      ? parsed.ideas
          .filter((i: any) => i && typeof i.title === 'string' && i.title.trim())
          .map((i: any) => ({ title: String(i.title).trim().slice(0, 200), notes: (i.notes ? String(i.notes).trim() : '').slice(0, 600) || null }))
      : []

    if (ideas.length === 0) return json({ error: 'Keine Ideen erhalten. Bitte nochmal versuchen.' }, 200)
    return json({ ideas })
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
