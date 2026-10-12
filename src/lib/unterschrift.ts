import { supabase } from './supabase'

// Unterschreiben eines Vertrags über seinen Token.
//
// Es gibt zwei Fassungen der Datenbankfunktion: die alte mit drei Argumenten
// (nur getippter Name) und die neue mit vier (zusätzlich der gezeichnete Zug).
// Solange Skript 0036 nicht gelaufen ist, existiert nur die alte. Deshalb
// versuchen wir erst die neue und fallen sauber zurück, statt den Kunden vor
// einer Fehlermeldung stehen zu lassen.
export async function unterschreibe(
  token: string,
  name: string,
  rolle: string,
  signatur: string | null,
): Promise<{ signaturGespeichert: boolean }> {
  const neu = await supabase.rpc('sign_contract', {
    t: token, name, role: rolle, signature: signatur ?? '',
  })
  if (!neu.error) return { signaturGespeichert: !!signatur }

  // Nur zurückfallen, wenn es wirklich an der fehlenden Fassung liegt --
  // ein echter Fehler (ungültiger Token, schon unterschrieben) muss durch.
  if (!funktionFehlt(neu.error)) throw new Error(neu.error.message)

  const alt = await supabase.rpc('sign_contract', { t: token, name, role: rolle })
  if (alt.error) throw new Error(alt.error.message)
  return { signaturGespeichert: false }
}

// PostgREST meldet eine unbekannte Funktion mit PGRST202.
function funktionFehlt(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST202') return true
  const m = (error.message ?? '').toLowerCase()
  return m.includes('could not find the function') || m.includes('does not exist')
}

// Ein unberührtes Feld liefert trotzdem eine Data-URL -- die wollen wir nicht
// als Unterschrift speichern.
export function hatUnterschrift(datenUrl: string | null | undefined): boolean {
  return !!datenUrl && datenUrl.startsWith('data:image/') && datenUrl.length > 1000
}
