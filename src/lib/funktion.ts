import { supabase } from './supabase'

// Alle Aufrufe von Edge Functions laufen hier durch.
//
// Grund: supabase-js wirft bei jedem Fehlerstatus nur "Edge Function returned
// a non-2xx status code". Der eigentliche Grund -- etwa "Zoho-Secrets fehlen"
// oder "Apify-Token ungueltig" -- steckt im Antworttext, den die Bibliothek
// nicht ausliest. Damit stand in der App bisher eine Meldung, mit der niemand
// etwas anfangen kann. Hier holen wir den echten Text heraus.

// Holt die Klartext-Meldung aus einem Fehler von supabase.functions.invoke.
export async function funktionsFehler(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: unknown }
  const ctx = e?.context
  // context ist bei einem Fehlerstatus die Response der Function
  if (ctx && typeof (ctx as Response).text === 'function') {
    try {
      const roh = await (ctx as Response).clone().text()
      if (roh) {
        try {
          const j = JSON.parse(roh) as { error?: string; message?: string }
          const txt = j.error || j.message
          if (txt) return txt
        } catch {
          // kein JSON -- dann den rohen Text nehmen, aber gekuerzt
        }
        return roh.slice(0, 300)
      }
    } catch {
      // Antwort nicht lesbar -- unten auf die allgemeine Meldung zurueckfallen
    }
  }
  // Kein lesbarer Text -- dann wenigstens der Status, der sagt schon etwas aus
  const status = (ctx as Response)?.status
  const allgemein = e?.message || 'Unbekannter Fehler'
  return status ? `${allgemein} (Status ${status})` : allgemein
}

// Edge Function aufrufen und bei einem Fehler mit Klartext abbrechen.
export async function rufeFunktion<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(await funktionsFehler(error))
  // Manche Functions antworten mit Status 200 und { error: "..." } im Text
  const d = data as { error?: string } | null
  if (d && typeof d === 'object' && d.error) throw new Error(d.error)
  return data as T
}
