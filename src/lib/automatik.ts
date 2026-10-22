// Schnitt-Automatik anstossen, sobald es Arbeit gibt (statt stuendlich).
// Doppelstarts verhindert die Edge Function selbst. Fehler sind egal:
// die Arbeit liegt in der Datenbank und wird spaetestens beim naechsten
// Sicherheitslauf erledigt.
import { rufeFunktion } from './funktion'

export async function automatikAnstossen(anlass: string): Promise<void> {
  try { await rufeFunktion('automatik-start', { anlass }) } catch { /* egal */ }
}
