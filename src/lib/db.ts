import { supabase } from './supabase'

// Spalten, die erst durch spätere SQL-Skripte entstehen. Fehlen sie noch,
// soll das Anlegen/Speichern trotzdem klappen (nur ohne diese Extras) —
// damit ein nicht eingespieltes Skript nie die Kernfunktion blockiert.
const OPTIONAL_COLS = [
  'category', 'series_id', 'priority', 'contract_end', 'recipient', 'service_period', 'vat_rate', 'items',
  'due_time',
  'views_ig', 'likes_ig', 'comments_ig', 'shares_ig', 'saves_ig',
  'views_tiktok', 'likes_tiktok', 'comments_tiktok', 'shares_tiktok', 'saves_tiktok',
]

// Fehlt eine ganze TABELLE, ist das kein Spaltenproblem — dann hilft auch
// kein zweiter Versuch ohne die optionalen Spalten. Ein noch nicht
// eingespieltes SQL-Skript, sonst nichts.
export function tableMissing(err: any): string | null {
  if (!err) return null
  const raw = `${err.message ?? ''} ${err.details ?? ''}`
  const m = raw.toLowerCase()
  if (!m.includes('could not find the table') && !(m.includes('relation') && m.includes('does not exist'))) return null
  return raw.match(/(?:table|relation)\s+'?"?(?:public\.)?(\w+)/i)?.[1] ?? ''
}

// Welche Tabelle kommt aus welchem SQL-Skript — damit die App sagen kann,
// was am PC noch fehlt, statt nur "schema cache".
const SKRIPT_ZU_TABELLE: Record<string, string> = {
  inspirations: 'ALLES_offen_20-23.sql',
}

// Datenbank-Meldungen in Klartext. Alles, was wir nicht kennen, bleibt wie es ist.
export function dbKlartext(msg: string): string {
  const err = { message: msg }
  const tbl = tableMissing(err)
  if (tbl == null) return msg
  const skript = SKRIPT_ZU_TABELLE[tbl]
  return skript
    ? `Dafür fehlt noch eine Ergänzung in der Datenbank. Bitte am PC im Supabase SQL-Editor einmal das Skript „${skript}" ausführen — danach klappt es.`
    : 'Dafür fehlt noch eine Ergänzung in der Datenbank (ein SQL-Skript wurde noch nicht ausgeführt).'
}

function schemaMiss(err: any): boolean {
  if (!err) return false
  // Fehlende Tabelle: nicht erneut versuchen, das wird nichts.
  if (tableMissing(err) != null) return false
  if (err.code === 'PGRST204') return true // "Could not find the 'x' column ... in the schema cache"
  const m = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase()
  return m.includes('schema cache') || (m.includes('column') && m.includes('does not exist'))
}

function strip<T extends Record<string, any>>(obj: T): T {
  const c = { ...obj }
  for (const k of OPTIONAL_COLS) delete (c as any)[k]
  return c
}

// Insert mit automatischem Wiederholversuch ohne die optionalen Spalten
export async function insertRows(table: string, rows: Record<string, any>[]) {
  let res = await supabase.from(table).insert(rows)
  if (res.error && schemaMiss(res.error)) res = await supabase.from(table).insert(rows.map(strip))
  return res
}

// Update analog
export async function updateRow(table: string, payload: Record<string, any>, col: string, val: any) {
  let res = await supabase.from(table).update(payload).eq(col, val)
  if (res.error && schemaMiss(res.error)) res = await supabase.from(table).update(strip(payload)).eq(col, val)
  return res
}
