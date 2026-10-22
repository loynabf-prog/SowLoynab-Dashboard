// Supabase Edge Function: assistent
// -------------------------------------------------------------------------
// Macht aus einem Auftrag in Alltagssprache einen PLAN aus mehreren
// Schritten. Zum Beispiel:
//
//   "Leg Pizzeria Bella an, 1.200 im Monat, 12 Videos ab Oktober, immer
//    am 1., 3., 5. — aber am 17. nicht, und trag mir Freitag ab 16 Uhr
//    Arbeitszeit ein."
//
// Das ist ein Satz, aber drei Schritte. Frueher gab diese Funktion genau
// eine Absicht zurueck; damit liessen sich solche Auftraege nicht abbilden.
//
// Diese Funktion SCHREIBT NICHTS. Sie plant nur. Ausgefuehrt wird in der
// App, unter dem angemeldeten Nutzer und den normalen Schutzregeln der
// Datenbank — es gibt nirgends einen Generalschluessel, der alles duerfte.
// Und der Nutzer sieht den Plan, bevor etwas passiert.
//
// Secret (Supabase -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  -> fuer Claude

import { WERKZEUGE } from '../_shared/werkzeuge.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Ctx {
  today?: string
  clients?: { id: string; name: string; monthly_quota?: number | null }[]
  leads?: { id: string; name: string }[]
  members?: { id: string; name: string }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)

    const body = await req.json().catch(() => ({}))
    const auftrag = String(body?.text ?? '').trim()
    if (!auftrag) return json({ error: 'Kein Text empfangen.' }, 400)

    const ctx: Ctx = (body?.context ?? {}) as Ctx
    const heute = ctx.today || new Date().toISOString().slice(0, 10)

    const kunden = (ctx.clients ?? [])
      .map((c) => `- ${c.name} (id: ${c.id}${c.monthly_quota ? `, ${c.monthly_quota} Videos/Monat` : ''})`)
      .join('\n') || '(noch keine)'
    const leads = (ctx.leads ?? []).map((l) => `- ${l.name} (id: ${l.id})`).join('\n') || '(noch keine)'
    const team = (ctx.members ?? []).map((m) => `- ${m.name} (id: ${m.id})`).join('\n') || '(niemand)'

    const system = [
      'Du bist der Assistent einer Social-Media-Agentur (Sow & Loynab, Münster, Gastronomie).',
      'Der Nutzer gibt dir einen Auftrag in Alltagssprache. Setze ihn in Werkzeug-Aufrufe um.',
      '',
      `Heute ist der ${heute}. Rechne relative Angaben ("ab Oktober", "nächsten Freitag") in echte Daten um.`,
      '',
      'Bekannte Kunden:',
      kunden,
      '',
      'Bekannte Leads:',
      leads,
      '',
      'Team:',
      team,
      '',
      'Regeln:',
      '- Ein Auftrag darf MEHRERE Werkzeuge nacheinander auslösen. Genau dafür sind sie da.',
      '- Steht der Kunde schon in der Liste, nimm seine id. Lege ihn NICHT neu an.',
      '- Legst du einen Kunden neu an, gib ihm einen ref ("k1") und verweise in den',
      '  folgenden Schritten mit client_ref darauf.',
      '- "12 Videos im Monat, immer am 1., 3., 5." heißt: monatsplan mit anzahl=12,',
      '  start_tag=1, abstand=2. Rechne den Abstand aus den genannten Tagen aus.',
      '- "aber am 17. nicht" gehört als auslassen=[17] in denselben monatsplan-Schritt,',
      '  nicht als eigener Lösch-Schritt.',
      '- Mehrere Leads in einem Satz heissen mehrere lead_anlegen-Aufrufe --',
      '  einer je Betrieb, mit dem jeweils genannten Stand.',
      '- Steht der Lead schon in der Liste, nimm lead_aendern mit seiner id,',
      '  statt ihn noch einmal anzulegen.',
      '- Wird beim Kunden ein Instagram- oder TikTok-Handle genannt, ruf danach',
      '  profilbild_holen auf -- einmal je Plattform.',
      '- Beschreibt der Nutzer eine Videoidee inhaltlich, leg sie mit idee_anlegen an',
      '  und schreib die Beschreibung in notiz -- die App macht daraus automatisch die',
      '  Caption. Einen eigenen caption_schreiben-Schritt brauchst du dann NICHT.',
      '- caption_schreiben nur, wenn ausdruecklich eine Caption fuer ein BESTEHENDES',
      '  Video gewuenscht ist.',
      '- Hashtags erfindest du nicht und nennst du nicht -- die haengt die App aus den',
      '  Einstellungen selbst an.',
      '- Erfinde nichts. Was nicht gesagt wurde, bleibt null.',
      '- Bist du dir bei etwas Wesentlichem unsicher, rufe KEIN Werkzeug auf und',
      '  frag in einem Satz nach.',
      '- Antworte am Ende mit einem kurzen Satz, was du vorbereitet hast.',
    ].join('\n')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        system,
        tools: WERKZEUGE,
        messages: [{ role: 'user', content: auftrag }],
      }),
    })

    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `Claude antwortet nicht (${resp.status}): ${detail.slice(0, 200)}` }, 502)
    }

    const data = await resp.json()
    const bloecke: any[] = Array.isArray(data?.content) ? data.content : []

    // Werkzeug-Aufrufe in Schritte uebersetzen. Die Reihenfolge der Bloecke
    // IST die Reihenfolge der Schritte -- darauf verlaesst sich die App beim
    // Ausfuehren.
    const schritte = bloecke
      .filter((b) => b?.type === 'tool_use')
      .map((b) => ({ art: b.name, ...(b.input ?? {}) }))

    const text = bloecke
      .filter((b) => b?.type === 'text')
      .map((b) => String(b.text ?? '').trim())
      .filter(Boolean)
      .join('\n')

    return json({ schritte, text, auftrag })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
