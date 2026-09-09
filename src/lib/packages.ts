import { supabase } from './supabase'

// Unsere Standard-Angebote. Liegen einmal fest und werden beim Kunden
// uebernommen — Preis und Videomenge muessen nicht jedes Mal neu getippt
// werden. Beim Kunden bleibt alles ueberschreibbar.
export interface Package {
  id: string
  name: string
  price_monthly: number | null
  videos_min: number | null
  videos_max: number | null
  notes: string | null
  sort_order: number
  active: boolean
}

export async function getPackages(): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
  // Tabelle fehlt noch (Skript 24) — dann eben keine Pakete, kein Drama.
  if (error) return []
  return (data ?? []) as Package[]
}

// Wie ein Paket beim Kunden aussieht: "Wachstum · 8–12 Videos"
export function packageLabel(p: Package): string {
  const menge = mengeText(p)
  return menge ? `${p.name} · ${menge}` : p.name
}

export function mengeText(p: Package): string {
  if (p.videos_min != null && p.videos_max != null && p.videos_min !== p.videos_max) {
    return `${p.videos_min}–${p.videos_max} Videos`
  }
  const n = p.videos_min ?? p.videos_max
  return n != null ? `${n} Videos` : ''
}
