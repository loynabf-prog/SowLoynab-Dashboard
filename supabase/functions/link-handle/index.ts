// Supabase Edge Function: link-handle
// Loest Kurzlinks (vm.tiktok.com) auf und liefert den Account-Handle, der das
// Video gepostet hat. POST { urls: string[] } -> { ergebnisse: [{url, final, status, handle}] }
// Genutzt am 29.10.2026, um die Schleckofatz/Schmackofatz-Videos dem richtigen
// Betrieb (client_channels) zuzuordnen. Instagram antwortet mit Login-Wand --
// dafuer apify-lookup nehmen (liefert instagram.username).

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function eins(url: string) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' }, redirect: 'follow' })
    const final = r.url
    const text = r.ok ? await r.text() : ''
    const h = /tiktok\.com\/@([A-Za-z0-9_.]+)\//.exec(final)?.[1]
      ?? /"uniqueId":"([^"]+)"/.exec(text)?.[1]
      ?? /instagram\.com\/([A-Za-z0-9_.]+)\/reel\//.exec(final)?.[1]
      ?? /"username":"([^"]+)"/.exec(text)?.[1]
      ?? null
    return { url, final, status: r.status, handle: h }
  } catch (e) {
    return { url, final: null, status: 0, handle: null, fehler: (e as Error).message }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const { urls } = await req.json().catch(() => ({ urls: [] }))
  const ergebnisse: unknown[] = []
  for (const u of (urls ?? []) as string[]) {
    ergebnisse.push(await eins(u))
    await new Promise((r) => setTimeout(r, 400))
  }
  return new Response(JSON.stringify({ ergebnisse }), { headers: { ...CORS, 'content-type': 'application/json' } })
})
