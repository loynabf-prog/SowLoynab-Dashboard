// Dringlichkeits-Stufen für Aufgaben (unabhängig vom Datum).
export interface PrioDef { value: number; label: string; color: string; icon: string }

export const PRIORITIES: PrioDef[] = [
  { value: 3, label: 'Dringend', color: '#dc2626', icon: '🔴' },
  { value: 2, label: 'Wichtig', color: '#f59e0b', icon: '🟡' },
  { value: 1, label: 'Kann warten', color: '#16a34a', icon: '🟢' },
]

export function prioById(v: number | null | undefined): PrioDef | undefined {
  return v ? PRIORITIES.find((p) => p.value === v) : undefined
}
