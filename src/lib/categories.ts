import { supabase } from './supabase'

export interface Category {
  id: string
  name: string
  color: string
}

// 15 gut unterscheidbare Farben (funktionieren hell & dunkel)
export const CATEGORY_PALETTE = [
  '#e0521a', // Markenorange
  '#c69749', // Gold
  '#dc2626', // Rot
  '#db2777', // Pink
  '#7c3aed', // Violett
  '#2563eb', // Blau
  '#0ea5e9', // Himmelblau
  '#0d9488', // Petrol
  '#059669', // Grün
  '#65a30d', // Limette
  '#f59e0b', // Bernstein
  '#b45309', // Braun
  '#0891b2', // Cyan
  '#9333ea', // Lila
  '#4b5563', // Schiefer
]

// Sinnvolle Startvorlagen (nur Vorschlag beim ersten Öffnen)
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'dreh', name: 'Kundendreh', color: '#dc2626' },
  { id: 'schnitt', name: 'Videoschnitt', color: '#2563eb' },
  { id: 'konzept', name: 'Konzept', color: '#059669' },
  { id: 'orga', name: 'Orga / Sonstiges', color: '#4b5563' },
]

export async function getCategories(): Promise<Category[]> {
  const { data } = await supabase.from('app_settings').select('data').eq('id', 1).single()
  const cats = (data?.data as any)?.categories
  return Array.isArray(cats) ? (cats as Category[]) : []
}

export async function saveCategories(categories: Category[]): Promise<void> {
  const { data } = await supabase.from('app_settings').select('data').eq('id', 1).single()
  const next = { ...((data?.data as any) ?? {}), categories }
  await supabase.from('app_settings').update({ data: next, updated_at: new Date().toISOString() }).eq('id', 1)
}
