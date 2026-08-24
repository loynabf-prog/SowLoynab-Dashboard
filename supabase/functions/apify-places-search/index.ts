// Supabase Edge Function: apify-places-search
// -------------------------------------------------------------------------
// Durchsucht Google Maps über Apify (Google Maps Scraper von Compass) nach
// Betrieben (z. B. "Restaurant in Münster") und liefert eine Liste mit
// Name/Adresse/Telefon/Website/Kategorie/Bewertung zurück -- Grundlage für
// den Leads-Import per Klick (siehe GoogleMapsSearchModal in Leads.tsx).
//
// Kein Datenbank-Zugriff hier -- reiner Suche-und-Rückgabe-Schritt, der
// eigentliche Import in die Leads-Liste passiert im Frontend.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   APIFY_TOKEN        – dasselbe Token wie bei den anderen Apify-Funktionen
//   APIFY_PLACES_ACTOR – optional, Default compass~crawler-google-places
//
// "Enforce JWT" für diese Funktion AN lassen -- jede Suche kostet echtes
// Geld bei Apify, das soll nur eingeloggten Team-Mitgliedern möglich sein.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function pickStr(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

function pickNum(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && !isNaN(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  }
  return null
}

async function apifyRun(actor: string, input: unknown, token: string): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=180`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) throw new Error(`Apify ${resp.status}: ${(await resp.text()).slice(0, 160)}`)
  const data = await resp.json()
  return Array.isArray(data) ? data : []
}

interface Place {
  name: string
  address: string | null
  city: string | null
  phone: string | null
  website: string | null
  category: string | null
  rating: number | null
  reviews: number | null
  mapsUrl: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { query, maxResults } = await req.json()
    if (!query || !String(query).trim()) return json({ error: 'Bitte einen Suchbegriff angeben.' }, 400)

    const token = Deno.env.get('APIFY_TOKEN')
    if (!token) return json({ error: 'APIFY_TOKEN fehlt (Supabase Secret).' }, 500)
    const actor = Deno.env.get('APIFY_PLACES_ACTOR') || 'compass~crawler-google-places'
    const max = Math.min(Math.max(Number(maxResults) || 60, 1), 200)

    const items = await apifyRun(actor, {
      searchStringsArray: [String(query).trim()],
      maxCrawledPlacesPerSearch: max,
      language: 'de',
      skipClosedPlaces: true,
    }, token)

    const places: Place[] = items
      .map((it: any): Place => ({
        name: pickStr(it, ['title', 'name']) ?? '',
        address: pickStr(it, ['address', 'street']),
        city: pickStr(it, ['city']),
        phone: pickStr(it, ['phone', 'phoneUnformatted']),
        website: pickStr(it, ['website']),
        category: pickStr(it, ['categoryName', 'category']),
        rating: pickNum(it, ['totalScore', 'rating']),
        reviews: pickNum(it, ['reviewsCount', 'reviews']),
        mapsUrl: pickStr(it, ['url']),
      }))
      .filter((p) => p.name !== '')

    return json({ places, count: places.length })
  } catch (err) {
    return json({ error: `Fehler: ${(err as Error).message}` }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
