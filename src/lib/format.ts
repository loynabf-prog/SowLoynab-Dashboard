export function euro(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

export function dateShort(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function dateRelative(d: string | null): { text: string; overdue: boolean; soon: boolean } {
  if (!d) return { text: 'kein Datum', overdue: false, soon: false }
  const date = new Date(d + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)
  const base = date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })
  if (diff < 0) return { text: base, overdue: true, soon: false }
  if (diff === 0) return { text: 'Heute', overdue: false, soon: true }
  if (diff === 1) return { text: 'Morgen', overdue: false, soon: true }
  return { text: base, overdue: false, soon: diff <= 3 }
}
