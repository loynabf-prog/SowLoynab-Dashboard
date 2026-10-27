// Welcher Betrieb wurde gepostet? (Schleckofatz oder Schmackofatz)
// -------------------------------------------------------------------------
// Hat ein Kunde zwei Betriebe mit eigenen Accounts, kann die Link-Abholung
// nicht raten, auf welchem Account das Video rausging. Deshalb fragt die App
// beim Tipp auf "Gepostet" kurz nach -- einmal, an einer Stelle, egal von
// welcher Seite aus gepostet wird. Die Frage selbst zeigt die Komponente
// BetriebWahl (im Layout eingehaengt); hier steckt nur die Logik.

import { ladeKanaele, trenntKanaele, type Channel } from './channels'

/** Rueckgabe der Frage: Kanal-Id, oder undefined = abgebrochen. */
type Frage = (kanaele: Channel[]) => Promise<string | undefined>

let frage: Frage | null = null

/** Von BetriebWahl beim Einhaengen gesetzt (und beim Aushaengen geloescht). */
export function setBetriebFrage(f: Frage | null): void {
  frage = f
}

export const ABGEBROCHEN = 'Abgebrochen – nichts geändert'

export type BetriebErgebnis = { ok: true; channelId: string | null } | { ok: false }

/**
 * Betrieb fuer ein Posting bestimmen.
 * - Video hat schon einen Betrieb -> den nehmen, nicht fragen.
 * - Kunde hat nur einen Betrieb -> nichts zu fragen.
 * - sonst fragen; Abbrechen -> { ok: false }.
 */
export async function betriebFuerPosten(
  clientId: string,
  vorhanden: string | null | undefined,
  laden: (id: string) => Promise<{ kanaele: Channel[] }> = ladeKanaele,
  fragen: Frage | null = frage,
): Promise<BetriebErgebnis> {
  if (vorhanden) return { ok: true, channelId: vorhanden }
  let kanaele: Channel[] = []
  try { kanaele = (await laden(clientId)).kanaele } catch { return { ok: true, channelId: null } }
  if (!trenntKanaele(kanaele) || !fragen) return { ok: true, channelId: null }
  const wahl = await fragen(kanaele)
  return wahl ? { ok: true, channelId: wahl } : { ok: false }
}

/**
 * Ist das ein Monats-Platzhalter ("Oktober 6", "Kebab Kumpels #3") und noch
 * keine echte Idee? Nur solche Slots fuellt "Video gepostet" auf -- ein Slot
 * mit echtem Titel ist ein geplantes Video und bleibt stehen.
 */
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const PLATZHALTER = new RegExp(`^(?:(?:${MONATE.join('|')})\\s+\\d+|.*#\\s*\\d+|Video\\s*\\d*)$`, 'i')
export function istPlatzhalter(titel: string | null | undefined): boolean {
  const t = (titel ?? '').trim()
  return t === '' || PLATZHALTER.test(t)
}
