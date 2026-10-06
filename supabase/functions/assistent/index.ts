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

// Die Werkzeuge, die der Assistent hat. Bewusst wenige und grob geschnitten:
// je naeher ein Werkzeug an dem liegt, was ein Mensch sagen wuerde, desto
// seltener setzt es die Maschine falsch zusammen.
const WERKZEUGE = [
  {
    name: 'kunde_anlegen',
    description: 'Legt einen neuen Kunden an. Nur benutzen, wenn der Kunde noch NICHT in der Liste der bekannten Kunden steht.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Kurzer Platzhalter wie "k1", auf den spätere Schritte verweisen.' },
        name: { type: 'string' },
        honorar: { type: ['number', 'null'], description: 'Monatliches Honorar in Euro.' },
        videos_pro_monat: { type: ['number', 'null'] },
        marke: { type: ['string', 'null'], enum: ['media', 'creator', null], description: 'media = Unternehmen, creator = Personenmarke. Im Zweifel media.' },
        kundenart: { type: ['string', 'null'], enum: ['zahlend', 'referenz', 'passiv', null] },
        instagram: { type: ['string', 'null'] },
        tiktok: { type: ['string', 'null'] },
        stadt: { type: ['string', 'null'] },
      },
      required: ['ref', 'name'],
    },
  },
  {
    name: 'monatsplan',
    description: 'Legt die Videokarten eines ganzen Monats an, gleichmäßig verteilt. Das ist der Normalfall für "so und so viele Videos im Monat".',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'], description: 'Id eines bekannten Kunden.' },
        client_ref: { type: ['string', 'null'], description: 'Platzhalter aus einem kunde_anlegen-Schritt.' },
        monat: { type: 'string', description: 'Format YYYY-MM.' },
        anzahl: { type: 'number' },
        abstand: { type: ['number', 'null'], description: 'Tage zwischen zwei Posts. Weglassen = passend zur Menge rechnen.' },
        start_tag: { type: ['number', 'null'], description: 'Tag im Monat, an dem begonnen wird. Standard 1.' },
        auslassen: { type: ['array', 'null'], items: { type: 'number' }, description: 'Tage im Monat, an denen NICHT gepostet wird.' },
        uhrzeit: { type: ['string', 'null'], description: 'HH:MM' },
      },
      required: ['monat', 'anzahl'],
    },
  },
  {
    name: 'video_anlegen',
    description: 'Ein einzelnes Video an einem Tag. Für den Monatsrhythmus stattdessen monatsplan nehmen.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        titel: { type: 'string' },
        datum: { type: 'string', description: 'YYYY-MM-DD' },
        uhrzeit: { type: ['string', 'null'] },
      },
      required: ['titel', 'datum'],
    },
  },
  {
    name: 'video_absagen',
    description: 'Legt die Videos eines Kunden an einem bestimmten Tag in den Papierkorb. Für "an dem Tag posten wir doch nicht".',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        datum: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['datum'],
    },
  },
  {
    name: 'kunde_aendern',
    description: 'Ändert Felder eines bestehenden Kunden, z. B. Honorar oder Videomenge.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        felder: {
          type: 'object',
          description: 'Nur erlaubte Spalten: monthly_fee, monthly_quota, city, phone, email, website, contact_person, notes, brand, client_type.',
        },
      },
      required: ['felder'],
    },
  },
  {
    name: 'aufgabe_anlegen',
    description: 'Eine To-do-Aufgabe. Optional mit Kunde, Datum, Uhrzeit und Zuständigem.',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        datum: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        uhrzeit: { type: ['string', 'null'] },
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        wer: { type: ['array', 'null'], items: { type: 'string' }, description: 'Ids aus der Teamliste. Leer = alle.' },
      },
      required: ['titel'],
    },
  },
  {
    name: 'lead_anlegen',
    description: 'Ein Interessent, der noch kein Kunde ist. Für "neuer Lead", "Kontakt", "da waren wir im Gespräch". Mehrere Leads = mehrere Aufrufe.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: ['string', 'null'], description: 'Platzhalter wie "l1", falls ein späterer Schritt darauf verweist.' },
        name: { type: 'string', description: 'Name des Betriebs.' },
        stand: {
          type: ['string', 'null'],
          enum: ['new', 'contacted', 'talking', 'offer', 'won', 'lost', null],
          description: 'Wie weit man ist: new=noch nichts, contacted=angeschrieben/angerufen, talking=im Gespräch, offer=Angebot raus, won=gewonnen, lost=abgesagt.',
        },
        ansprechpartner: { type: ['string', 'null'] },
        telefon: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        instagram: { type: ['string', 'null'] },
        stadt: { type: ['string', 'null'] },
        potenzial: { type: ['number', 'null'], description: 'Mögliches Honorar pro Monat in Euro.' },
        naechster_schritt: { type: ['string', 'null'], description: 'Datum YYYY-MM-DD für die nächste Nachfassung.' },
        notiz: { type: ['string', 'null'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'lead_aendern',
    description: 'Ändert einen bestehenden Lead, meist den Stand ("bei dem sind wir jetzt im Gespräch").',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: ['string', 'null'] },
        lead_ref: { type: ['string', 'null'] },
        stand: { type: ['string', 'null'], enum: ['new', 'contacted', 'talking', 'offer', 'won', 'lost', null] },
        felder: { type: ['object', 'null'], description: 'Weitere Spalten: potential_fee, next_followup, notes, phone, email, city, contact_person.' },
      },
    },
  },
  {
    name: 'idee_anlegen',
    description: 'Eine Videoidee in den Ideenspeicher eines Kunden — noch kein Termin, nur gemerkt.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        titel: { type: 'string' },
        notiz: { type: ['string', 'null'] },
      },
      required: ['titel'],
    },
  },
  {
    name: 'profilbild_holen',
    description: 'Holt das öffentliche Profilbild zu einem Handle und setzt es als Logo des Kunden. Nach kunde_anlegen aufrufen, wenn ein Handle genannt wurde.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        plattform: { type: 'string', enum: ['instagram', 'tiktok'] },
        handle: { type: 'string', description: 'Ohne @.' },
      },
      required: ['plattform', 'handle'],
    },
  },
  {
    name: 'termin_anlegen',
    description: 'Arbeitszeit, Spiel oder sonstiger Termin — alles, was den Tag belegt, aber kein Video und keine Aufgabe ist.',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        kind: { type: 'string', enum: ['arbeit', 'spiel', 'termin'] },
        von: { type: 'string', description: 'YYYY-MM-DD' },
        bis: { type: ['string', 'null'], description: 'YYYY-MM-DD, nur bei mehrtägig.' },
        ab: { type: ['string', 'null'], description: 'HH:MM. Ohne Zeiten = ganztägig.' },
        bis_zeit: { type: ['string', 'null'], description: 'HH:MM' },
        wer: { type: ['array', 'null'], items: { type: 'string' }, description: 'Ids aus der Teamliste. Leer = gilt für alle.' },
      },
      required: ['titel', 'kind', 'von'],
    },
  },
]

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
