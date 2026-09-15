// Papierkorb: mehrere Einträge eines Kunden auf einmal zurückholen.
// ---------------------------------------------------------------------------
// Videos, Ideen und Inspirationen werden nicht wirklich geloescht, sondern
// nur mit deleted_at markiert. Einzeln zurueckholen geht im Papierkorb schon
// lange -- bei zwei Dutzend Videos ist das aber zwei Dutzend Antipper.

import { supabase } from './supabase'

/** Tabellen mit Papierkorb, die an einem Kunden haengen. */
export const KUNDEN_TABELLEN = ['videos', 'video_ideas', 'inspirations', 'tasks'] as const
export type KundenTabelle = typeof KUNDEN_TABELLEN[number]

export const TABELLE_NAME: Record<KundenTabelle, string> = {
  videos: 'Videos',
  video_ideas: 'Ideen',
  inspirations: 'Inspirationen',
  tasks: 'Aufgaben',
}

export interface PapierkorbStand {
  tabelle: KundenTabelle
  anzahl: number
}

/** Was liegt bei diesem Kunden im Papierkorb? */
export async function papierkorbStand(clientId: string): Promise<PapierkorbStand[]> {
  const out: PapierkorbStand[] = []
  for (const t of KUNDEN_TABELLEN) {
    const { count, error } = await supabase
      .from(t)
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .not('deleted_at', 'is', null)
    if (error) continue
    if ((count ?? 0) > 0) out.push({ tabelle: t, anzahl: count ?? 0 })
  }
  return out
}

/**
 * Alle Papierkorb-Eintraege einer Tabelle fuer einen Kunden zurueckholen.
 *
 * Gibt die Zahl der zurueckgeholten Zeilen mit, damit man hinterher sieht,
 * dass wirklich etwas passiert ist -- ein stilles "fertig" hilft niemandem,
 * der gerade seine Videos sucht.
 */
export async function holeZurueck(
  clientId: string,
  tabelle: KundenTabelle,
): Promise<{ anzahl: number; error: string | null }> {
  const { data, error } = await supabase
    .from(tabelle)
    .update({ deleted_at: null })
    .eq('client_id', clientId)
    .not('deleted_at', 'is', null)
    .select('id')
  if (error) return { anzahl: 0, error: error.message }
  return { anzahl: (data ?? []).length, error: null }
}

/** Alles auf einmal: jede Tabelle dieses Kunden aus dem Papierkorb holen. */
export async function holeAllesZurueck(
  clientId: string,
): Promise<{ anzahl: number; error: string | null }> {
  let gesamt = 0
  for (const t of KUNDEN_TABELLEN) {
    const { anzahl, error } = await holeZurueck(clientId, t)
    // Fehlende Tabelle ist kein Grund abzubrechen -- sie hat dann nichts drin.
    if (error && !/does not exist|schema cache/i.test(error)) return { anzahl: gesamt, error }
    gesamt += anzahl
  }
  return { anzahl: gesamt, error: null }
}
