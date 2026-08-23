// Wiederholungs-Regeln für Aufgaben & Videos — bewusst simpel gehalten.
//  - none:    einmalig
//  - days:    alle N Tage
//  - weekly:  an bestimmten Wochentagen (Mo=0 … So=6), jede Woche
//  - monthly: am selben Tag, alle N Monate
// „until" leer = unbegrenzt → dann wird ein Horizont (Standard 90 Tage) erzeugt,
// den man später verlängern kann.

export type RepeatKind = 'none' | 'days' | 'weekly' | 'monthly'

export interface RepeatRule {
  kind: RepeatKind
  interval?: number      // days: alle N Tage · monthly: alle N Monate
  weekdays?: number[]    // weekly: 0=Mo … 6=So
  until?: string | null  // ISO-Datum oder null = unbegrenzt
}

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const parse = (iso: string) => new Date(iso + 'T00:00:00')
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// 0 = Montag … 6 = Sonntag
export const mondayDow = (d: Date) => (d.getDay() + 6) % 7

export function occurrences(
  anchorISO: string,
  rule: RepeatRule,
  opts: { horizonDays?: number; max?: number } = {},
): string[] {
  const max = opts.max ?? 200
  const horizonDays = opts.horizonDays ?? 90
  if (!anchorISO) return []
  if (rule.kind === 'none') return [anchorISO]

  const start = parse(anchorISO)
  const end = rule.until ? parse(rule.until) : (() => { const e = new Date(start); e.setDate(e.getDate() + horizonDays); return e })()
  const out: string[] = []

  if (rule.kind === 'days') {
    const step = Math.max(1, Math.round(rule.interval || 1))
    for (const d = new Date(start); d <= end && out.length < max; d.setDate(d.getDate() + step)) out.push(fmt(d))
  } else if (rule.kind === 'weekly') {
    const days = rule.weekdays && rule.weekdays.length ? rule.weekdays : [mondayDow(start)]
    for (const d = new Date(start); d <= end && out.length < max; d.setDate(d.getDate() + 1)) {
      if (days.includes(mondayDow(d))) out.push(fmt(d))
    }
  } else if (rule.kind === 'monthly') {
    const step = Math.max(1, Math.round(rule.interval || 1))
    const day = start.getDate()
    let d = new Date(start)
    while (d <= end && out.length < max) {
      out.push(fmt(d))
      const target = new Date(d.getFullYear(), d.getMonth() + step, 1)
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      target.setDate(Math.min(day, lastDay))
      d = target
    }
  }
  return out
}

// Empfohlener gleichmäßiger Abstand (in Tagen) für X Videos pro Monat.
// 10/Monat -> alle 3 Tage · 5/Monat -> alle 6 Tage (≈ 1× pro Woche) · usw.
export function recommendedIntervalDays(perMonth: number): number {
  if (!perMonth || perMonth <= 0) return 3
  return Math.max(1, Math.round(30 / perMonth))
}

// Menschlicher Kurztext für die Vorschau
export function describeRule(rule: RepeatRule): string {
  if (rule.kind === 'none') return 'Einmalig'
  if (rule.kind === 'days') return `Alle ${Math.max(1, rule.interval || 1)} Tage`
  if (rule.kind === 'weekly') {
    const days = (rule.weekdays && rule.weekdays.length ? rule.weekdays : []).map((w) => WEEKDAYS_SHORT[w]).join(', ')
    return days ? `Wöchentlich: ${days}` : 'Wöchentlich'
  }
  if (rule.kind === 'monthly') return `Alle ${Math.max(1, rule.interval || 1)} Monate`
  return ''
}
