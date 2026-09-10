import { supabase } from './supabase'

// Zwei Kunden zu einem machen: alles vom Quell-Kunden zieht um, der
// Quell-Kunde wandert danach in den Papierkorb.
//
// Gedacht fuer den Fall "ein Kunde, zwei Accounts": wenn wir insgesamt 16
// Videos zusagen und mal 10/6, mal 16/0 darauf verteilen, ist eine gemeinsame
// Akte ehrlicher als zwei halbe.

// Alles, was per client_id an einem Kunden haengt. Fehlt eine Tabelle noch
// (Skript nicht eingespielt), wird sie stillschweigend uebersprungen.
const TABELLEN = [
  'videos', 'video_ideas', 'inspirations', 'tasks', 'activities',
  'transactions', 'attachments', 'contacts', 'invoices', 'client_assets',
  'content_pillars', 'time_entries', 'contracts',
] as const

export interface MergeZaehlung {
  tabelle: string
  anzahl: number
}

// Was wuerde umziehen? Wird vor dem Zusammenfuehren angezeigt, damit niemand
// blind bestaetigt.
export async function zaehleUmzug(quelleId: string): Promise<MergeZaehlung[]> {
  const out: MergeZaehlung[] = []
  for (const t of TABELLEN) {
    const { count, error } = await supabase
      .from(t)
      .select('id', { count: 'exact', head: true })
      .eq('client_id', quelleId)
    if (error) continue
    if ((count ?? 0) > 0) out.push({ tabelle: t, anzahl: count ?? 0 })
  }
  return out
}

export const TABELLEN_NAMEN: Record<string, string> = {
  videos: 'Videos',
  video_ideas: 'Ideen',
  inspirations: 'Inspirationen',
  tasks: 'Aufgaben',
  activities: 'Verlaufseinträge',
  transactions: 'Buchungen',
  attachments: 'Dateien',
  contacts: 'Kontakte',
  invoices: 'Rechnungen',
  client_assets: 'Material',
  content_pillars: 'Content-Säulen',
  time_entries: 'Zeiteinträge',
  contracts: 'Verträge',
}

/**
 * Führt `quelleId` in `zielId` zusammen.
 *
 * Die Follower-Zahlen werden je Tag ADDIERT, nicht aneinandergehängt — zwei
 * Accounts unter einer Akte haben zusammen so viele Follower. Reihenfolge
 * bewusst "erst schreiben, dann löschen": so geht bei einem Abbruch nichts
 * verloren, schlimmstenfalls steht ein Wert doppelt.
 */
export async function fuehreZusammen(quelleId: string, zielId: string): Promise<{ error: string | null }> {
  if (quelleId === zielId) return { error: 'Quelle und Ziel sind derselbe Kunde.' }

  for (const t of TABELLEN) {
    const { error } = await supabase.from(t).update({ client_id: zielId }).eq('client_id', quelleId)
    // Fehlende Tabelle ist kein Grund abzubrechen — sie hat dann auch nichts drin.
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      return { error: `${TABELLEN_NAMEN[t] ?? t}: ${error.message}` }
    }
  }

  // Leads, die zu diesem Kunden geworden sind, zeigen künftig aufs Ziel
  await supabase.from('leads').update({ converted_client_id: zielId }).eq('converted_client_id', quelleId)

  const statsFehler = await vereineStats(quelleId, zielId)
  if (statsFehler) return { error: statsFehler }

  const { error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', quelleId)
  return { error: error?.message ?? null }
}

async function vereineStats(quelleId: string, zielId: string): Promise<string | null> {
  const { data: quelle, error: e1 } = await supabase
    .from('client_stats').select('*').eq('client_id', quelleId)
  if (e1) return null // Tabelle fehlt -> nichts zu tun
  if (!quelle || quelle.length === 0) return null

  const { data: ziel } = await supabase
    .from('client_stats').select('*').eq('client_id', zielId)
  const zielNachTag = new Map<string, any>()
  for (const r of ziel ?? []) zielNachTag.set(r.captured_on, r)

  const summe = (a: number | null, b: number | null) =>
    a == null && b == null ? null : (a ?? 0) + (b ?? 0)

  for (const q of quelle as any[]) {
    const z = zielNachTag.get(q.captured_on)
    if (z) {
      // Gleicher Tag: addieren und die Quellzeile danach entfernen
      const { error } = await supabase.from('client_stats').update({
        followers_ig: summe(z.followers_ig, q.followers_ig),
        followers_tiktok: summe(z.followers_tiktok, q.followers_tiktok),
        reach: summe(z.reach, q.reach),
      }).eq('id', z.id)
      if (error) return `Follower-Zahlen: ${error.message}`
      await supabase.from('client_stats').delete().eq('id', q.id)
    } else {
      // Tag gibt es beim Ziel noch nicht: Zeile einfach umhängen
      const { error } = await supabase.from('client_stats').update({ client_id: zielId }).eq('id', q.id)
      if (error) return `Follower-Zahlen: ${error.message}`
    }
  }
  return null
}
