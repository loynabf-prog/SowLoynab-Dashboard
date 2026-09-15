import { supabase } from './supabase'

// Zwei Kunden zu einem machen: alles vom Quell-Kunden zieht um, der
// Quell-Kunde wandert danach in den Papierkorb.
//
// Gedacht fuer den Fall "ein Kunde, zwei Accounts": wenn wir insgesamt 16
// Videos zusagen und mal 10/6, mal 16/0 darauf verteilen, ist eine gemeinsame
// Akte ehrlicher als zwei halbe.
//
// Die Social-Accounts ziehen mit um (client_accounts). Nach dem Zusammenlegen
// haengen also beide Instagram- und beide TikTok-Accounts am selben Kunden
// und werden beide weiter automatisch abgefragt.

// Alles, was per client_id an einem Kunden haengt. Fehlt eine Tabelle noch
// (Skript nicht eingespielt), wird sie stillschweigend uebersprungen.
const TABELLEN = [
  'videos', 'video_ideas', 'inspirations', 'tasks', 'activities',
  'transactions', 'attachments', 'contacts', 'invoices', 'client_assets',
  'content_pillars', 'time_entries', 'contracts', 'client_accounts',
] as const

export interface MergeZaehlung {
  tabelle: string
  anzahl: number
}

// Was wuerde umziehen? Wird vor dem Zusammenfuehren angezeigt, damit niemand
// blind bestaetigt.
export async function zaehleUmzug(quelleId: string): Promise<MergeZaehlung[]> {
  const out: MergeZaehlung[] = []
  // client_stats steht nicht in TABELLEN, weil es nicht einfach umgehaengt,
  // sondern tageweise addiert wird. Zaehlen wollen wir es trotzdem -- sonst
  // sieht es so aus, als haetten wir die Follower-Historie vergessen.
  for (const t of [...TABELLEN, 'client_stats'] as const) {
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
  client_accounts: 'Social-Accounts',
  client_stats: 'Follower-Zahlen (Tage)',
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
    if (!error) continue
    // Fehlende Tabelle ist kein Grund abzubrechen — sie hat dann auch nichts drin.
    if (/does not exist|schema cache/i.test(error.message)) continue
    // Haben beide Kunden denselben Account hinterlegt, wehrt sich der
    // Eindeutigkeits-Index. Dann ist der Account beim Ziel ohnehin schon da
    // und die Zeile der Quelle kann weg — kein Grund, den Umzug abzubrechen.
    if (t === 'client_accounts' && /duplicate key|unique/i.test(error.message)) {
      await raeumeDoppelteAccounts(quelleId, zielId)
      continue
    }
    return { error: `${TABELLEN_NAMEN[t] ?? t}: ${error.message}` }
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
  // Schluessel ist Tag PLUS Account: seit 0028 liegen in client_stats
  // nebeneinander die Gesamtzeile eines Tages (account_id leer) und je eine
  // Zeile pro Account. Nur der Tag als Schluessel wuerde eine Account-Zeile
  // in die Gesamtzeile addieren und den Tag damit doppelt zaehlen.
  const schluessel = (r: any) => `${r.captured_on}|${r.account_id ?? ''}`
  const zielNachTag = new Map<string, any>()
  for (const r of ziel ?? []) zielNachTag.set(schluessel(r), r)

  const summe = (a: number | null, b: number | null) =>
    a == null && b == null ? null : (a ?? 0) + (b ?? 0)

  for (const q of quelle as any[]) {
    const z = zielNachTag.get(schluessel(q))
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

/**
 * Accounts der Quelle einzeln umhaengen und die verwerfen, die es beim Ziel
 * schon gibt. Wird nur gebraucht, wenn beide Kunden denselben Account
 * hinterlegt hatten.
 */
async function raeumeDoppelteAccounts(quelleId: string, zielId: string) {
  const { data: quelle } = await supabase
    .from('client_accounts').select('id, platform, handle').eq('client_id', quelleId)
  const { data: ziel } = await supabase
    .from('client_accounts').select('platform, handle').eq('client_id', zielId)
  const da = new Set((ziel ?? []).map((z: any) => `${z.platform}|${String(z.handle).toLowerCase()}`))
  for (const q of (quelle ?? []) as any[]) {
    const k = `${q.platform}|${String(q.handle).toLowerCase()}`
    if (da.has(k)) await supabase.from('client_accounts').delete().eq('id', q.id)
    else await supabase.from('client_accounts').update({ client_id: zielId }).eq('id', q.id)
  }
}

/**
 * Schneller Blick: liegt im Papierkorb noch ein Kunde mit Videos?
 *
 * Bewusst nur zwei Abfragen und nur ueber die Videos -- das reicht, um den
 * Hinweis auf der Kundenseite ein- oder auszublenden. Die genaue
 * Aufschluesselung macht erst das Nachhol-Fenster, wenn es geoeffnet wird.
 */
export async function liegtWasImPapierkorb(): Promise<{ kunden: string[]; videos: number }> {
  const { data: tot, error } = await supabase
    .from('clients')
    .select('id, name')
    .not('deleted_at', 'is', null)
    .limit(50)
  if (error || !tot || tot.length === 0) return { kunden: [], videos: 0 }

  const ids = (tot as any[]).map((c) => c.id)
  const { data: vids } = await supabase
    .from('videos')
    .select('client_id')
    .in('client_id', ids)
    .limit(1000)
  if (!vids || vids.length === 0) return { kunden: [], videos: 0 }

  const mitInhalt = new Set((vids as any[]).map((v) => v.client_id))
  return {
    kunden: (tot as any[]).filter((c) => mitInhalt.has(c.id)).map((c) => c.name),
    videos: vids.length,
  }
}

export interface KundenBestand {
  id: string
  name: string
  geloescht: boolean
  videos: number
  /** Videos, die selbst im Papierkorb liegen. */
  imPapierkorb: number
}

/**
 * Wie viele Videos haengen an welchem Kunden -- geloeschte eingeschlossen.
 *
 * Gedacht fuer die Frage "wo sind meine Videos eigentlich hin?". Nach einem
 * Zusammenlegen in die falsche Richtung liegen sie bei einem anderen Kunden,
 * und ohne diese Uebersicht sucht man sie einzeln durch.
 *
 * Zwei Abfragen statt einer pro Kunde: Kundenliste holen, Video-Zuordnungen
 * holen, in JavaScript zaehlen.
 */
export async function bestandJeKunde(): Promise<KundenBestand[]> {
  const { data: kunden, error } = await supabase
    .from('clients')
    .select('id, name, deleted_at')
    .order('name')
    .limit(500)
  if (error || !kunden) return []

  const { data: vids } = await supabase
    .from('videos')
    .select('client_id, deleted_at')
    .limit(5000)

  // Getrennt zaehlen: ein Video im Papierkorb ist genauso wenig "weg" wie
  // eines beim falschen Kunden -- aber der Weg zurueck ist ein anderer.
  const aktiv = new Map<string, number>()
  const muell = new Map<string, number>()
  for (const v of (vids ?? []) as any[]) {
    const m = v.deleted_at ? muell : aktiv
    m.set(v.client_id, (m.get(v.client_id) ?? 0) + 1)
  }

  return (kunden as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    geloescht: c.deleted_at != null,
    videos: aktiv.get(c.id) ?? 0,
    imPapierkorb: muell.get(c.id) ?? 0,
  }))
}

/** Gesamtzahl aller Videos -- die Kontrollfrage "ist ueberhaupt etwas weg?". */
export async function videosGesamt(): Promise<{ aktiv: number; imPapierkorb: number }> {
  const { data } = await supabase.from('videos').select('deleted_at').limit(5000)
  const rows = (data ?? []) as any[]
  return {
    aktiv: rows.filter((r) => !r.deleted_at).length,
    imPapierkorb: rows.filter((r) => r.deleted_at).length,
  }
}
