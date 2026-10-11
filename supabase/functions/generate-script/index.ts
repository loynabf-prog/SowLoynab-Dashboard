// Supabase Edge Function: generate-script
// -------------------------------------------------------------------------
// Schreibt Drehskripte für einen ganzen Drehtag auf einmal.
//
// Der Unterschied zu "pro Video einzeln" ist der ganze Punkt: Wer fünf
// Videos an einem Nachmittag dreht, dreht sie nicht nacheinander von vorne
// bis hinten. Er dreht alles, was in der Küche spielt, am Stück. Er baut das
// Licht einmal um, nicht fünfmal. Deshalb bekommt die KI alle Videos des
// Tages zusammen und darf die Reihenfolge umstellen.
//
// Jedes Skript hat zwei Teile:
//   SO SOLL ES AUSSEHEN  – das fertige Video, Einstellung für Einstellung
//   SO DREHEN WIR DAS    – was heute vor Ort zu tun ist, in Drehreihenfolge
//
// Der zweite Teil ist der wichtigere. Beim Drehen hat niemand Zeit, sich
// eine Vision durchzulesen.
//
// Secret: ANTHROPIC_API_KEY
// Beim Deploy: "Enforce JWT" AN lassen.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VideoIn { id: string; titel: string; idee?: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt (Supabase Secret fehlt).' }, 500)

    const body = await req.json().catch(() => ({}))
    const videos = (Array.isArray(body?.videos) ? body.videos : []) as VideoIn[]
    if (videos.length === 0) return json({ error: 'Keine Videos übergeben.' }, 400)

    const kunde = String(body?.kunde ?? '').trim()
    const briefing = String(body?.briefing ?? '').trim()
    const ort = String(body?.ort ?? '').trim()
    const datum = String(body?.datum ?? '').trim()

    const liste = videos
      .map((v, i) => `${i + 1}. [${v.id}] ${v.titel}${v.idee ? ` — ${v.idee}` : ''}`)
      .join('\n')

    const system = [
      'Du bist Regisseur und Producer einer Social-Media-Agentur aus Münster,',
      'spezialisiert auf Gastronomie. Du schreibst Drehskripte für Reels.',
      '',
      'Du bekommst ALLE Videos eines Drehtags auf einmal. Plane sie als EINEN',
      'Dreh: fasse zusammen, was am selben Ort oder mit demselben Aufbau',
      'passiert, und bringe die Videos in eine sinnvolle Drehreihenfolge.',
      'Die Nummerierung des Nutzers ist die Posting-Reihenfolge, nicht die',
      'Drehreihenfolge — du darfst umsortieren.',
      '',
      'Je Video schreibst du ZWEI Blöcke:',
      '',
      'SO SOLL ES AUSSEHEN',
      '  Das fertige Reel, Einstellung für Einstellung. Je Einstellung eine',
      '  Zeile: Sekunde, Bild, Ton/Text. 15–30 Sekunden Gesamtlänge.',
      '',
      'SO DREHEN WIR DAS',
      '  Was heute vor Ort zu tun ist. Konkret und knapp: welche Einstellungen',
      '  am Stück, was gebraucht wird (Teller, Personen, Licht), worauf zu',
      '  achten ist. Das liest jemand mit dem Handy in der Hand — kurze',
      '  Zeilen, keine Absätze.',
      '',
      'Regeln:',
      '- Deutsch, du-Form, keine Werbesprache.',
      '- Realistisch für zwei Leute mit einem Handy und ohne Crew.',
      '- Erfinde keine Gerichte oder Räume, die nicht genannt wurden. Was du',
      '  nicht weißt, schreibst du als Lücke zum Ausfüllen: "[Gericht]".',
      '- Keine Einleitung, keine Zusammenfassung am Ende.',
      '',
      'Antworte AUSSCHLIESSLICH mit purem JSON in dieser Form:',
      '{"reihenfolge":["id","id"],"tagesplan":"kurzer Ablauf des Drehtags, 3–6 Zeilen",',
      ' "skripte":[{"id":"...","script":"SO SOLL ES AUSSEHEN\\n…\\n\\nSO DREHEN WIR DAS\\n…"}]}',
    ].join('\n')

    const nutzer = [
      kunde ? `Kunde: ${kunde}` : null,
      ort ? `Drehort: ${ort}` : null,
      datum ? `Drehtag: ${datum}` : null,
      briefing ? `Was der Betrieb macht: ${briefing}` : null,
      '',
      `Diese ${videos.length} Videos entstehen an diesem Tag:`,
      liste,
    ].filter((z) => z !== null).join('\n')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: nutzer }],
      }),
    })
    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: `Claude antwortet nicht (${resp.status}): ${detail.slice(0, 200)}` }, 502)
    }

    const data = await resp.json()
    const text = (data?.content ?? [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => String(b.text ?? ''))
      .join('')
      .trim()

    // Claude haelt sich fast immer an "nur JSON" -- aber eben nur fast. Ein
    // eingerahmter Codeblock soll den ganzen Drehtag nicht scheitern lassen.
    const roh = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    let geparst: any
    try {
      geparst = JSON.parse(roh)
    } catch {
      return json({ error: 'Die Antwort war nicht lesbar. Noch einmal versuchen.' }, 502)
    }

    const skripte = (Array.isArray(geparst?.skripte) ? geparst.skripte : [])
      .filter((s: any) => s?.id && s?.script)
      .map((s: any) => ({ id: String(s.id), script: String(s.script).trim() }))

    return json({
      skripte,
      tagesplan: String(geparst?.tagesplan ?? '').trim(),
      reihenfolge: Array.isArray(geparst?.reihenfolge) ? geparst.reihenfolge.map(String) : [],
    })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
