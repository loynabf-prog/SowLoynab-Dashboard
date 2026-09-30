// Wie viele Videos bekommt ein Kunde in einem bestimmten Monat?
// ---------------------------------------------------------------------------
// Normalfall ist der Retainer (clients.monthly_quota). Fuer einzelne Monate
// gibt es Ausnahmen -- Urlaub, Aktion, Saison. Die stehen in
// client_month_plans, eine Zeile je Kunde und Monat.
//
// Braucht Migration 0030. Fehlt sie, gibt es eben keine Ausnahmen und
// ueberall gilt der Retainer.

import { supabase } from './supabase'
import { tableMissing } from './db'

export interface Monatsmenge {
  month_key: string
  quota: number
}

/** Alle Ausnahmen eines Kunden, als Nachschlagewerk Monat -> Menge. */
export async function ladeMonatsmengen(clientId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('client_month_plans')
    .select('month_key, quota')
    .eq('client_id', clientId)
  if (error) return new Map()
  const out = new Map<string, number>()
  for (const r of (data ?? []) as any[]) out.set(r.month_key, Number(r.quota))
  return out
}

/**
 * Die Menge, die in diesem Monat gilt: Ausnahme, sonst Retainer.
 *
 * `ausnahmen` darf leer sein -- dann kommt immer der Retainer heraus.
 */
export function mengeFuer(
  retainer: number | null | undefined,
  monatsKey: string,
  ausnahmen: Map<string, number>,
): number {
  const a = ausnahmen.get(monatsKey)
  return a != null ? a : (retainer ?? 0)
}

/** Weicht dieser Monat vom Retainer ab? Fuer den Hinweis im Fenster. */
export function istAusnahme(
  retainer: number | null | undefined,
  monatsKey: string,
  ausnahmen: Map<string, number>,
): boolean {
  const a = ausnahmen.get(monatsKey)
  return a != null && a !== (retainer ?? 0)
}

/**
 * Ausnahme setzen oder wieder aufheben.
 *
 * Entspricht die Menge dem Retainer, wird die Ausnahme geloescht statt
 * gespeichert -- sonst sammeln sich Zeilen an, die nichts aussagen, und
 * eine spaetere Retainer-Aenderung ginge an ihnen vorbei.
 */
export async function setzeMonatsmenge(
  clientId: string,
  monatsKey: string,
  quota: number,
  retainer: number | null | undefined,
): Promise<{ error: string | null }> {
  if (quota === (retainer ?? 0)) {
    const { error } = await supabase
      .from('client_month_plans')
      .delete()
      .eq('client_id', clientId)
      .eq('month_key', monatsKey)
    if (error && tableMissing(error) == null) return { error: error.message }
    return { error: null }
  }

  const { error } = await supabase
    .from('client_month_plans')
    .upsert({ client_id: clientId, month_key: monatsKey, quota }, { onConflict: 'client_id,month_key' })
  if (error && tableMissing(error) == null) return { error: error.message }
  return { error: null }
}
