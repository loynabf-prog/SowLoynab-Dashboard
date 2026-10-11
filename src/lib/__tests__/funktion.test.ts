import { describe, it, expect } from 'vitest'
import { funktionsFehler } from '../funktion'

// Nachbau dessen, was supabase-js bei einem Fehlerstatus mitgibt:
// eine allgemeine Meldung plus die echte Antwort der Function in "context".
const fehler = (koerper: string, meldung = 'Edge Function returned a non-2xx status code') => ({
  message: meldung,
  context: new Response(koerper, { status: 500 }),
})

describe('funktionsFehler', () => {
  it('holt den echten Grund aus der Antwort statt der Allgemeinplatz-Meldung', async () => {
    const e = fehler(JSON.stringify({ error: 'Zoho-Secrets fehlen (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN).' }))
    expect(await funktionsFehler(e)).toBe('Zoho-Secrets fehlen (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN).')
  })
  it('nimmt auch das Feld "message"', async () => {
    expect(await funktionsFehler(fehler(JSON.stringify({ message: 'Apify-Token fehlt' })))).toBe('Apify-Token fehlt')
  })
  it('nimmt den rohen Text, wenn die Antwort kein JSON ist', async () => {
    expect(await funktionsFehler(fehler('Internal Server Error'))).toBe('Internal Server Error')
  })
  it('kuerzt sehr lange Antworten', async () => {
    const lang = await funktionsFehler(fehler('x'.repeat(1000)))
    expect(lang.length).toBe(300)
  })
  it('nennt wenigstens den Status, wenn die Antwort leer ist', async () => {
    expect(await funktionsFehler(fehler(''))).toBe('Edge Function returned a non-2xx status code (Status 500)')
  })
  it('kommt mit einem Fehler ohne context klar', async () => {
    expect(await funktionsFehler({ message: 'Netzwerkfehler' })).toBe('Netzwerkfehler')
    expect(await funktionsFehler({})).toBe('Unbekannter Fehler')
  })
})
