import { supabase } from './supabase'

// Spalten, die erst durch spätere SQL-Skripte entstehen. Fehlen sie noch,
// soll das Anlegen/Speichern trotzdem klappen (nur ohne diese Extras) —
// damit ein nicht eingespieltes Skript nie die Kernfunktion blockiert.
const OPTIONAL_COLS = ['category', 'series_id', 'priority', 'contract_end', 'recipient', 'service_period', 'vat_rate', 'items']

function schemaMiss(err: any): boolean {
  if (!err) return false
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
