// Brennt ein Video im Posting-Plan? Eigene Datei ohne Pakete, damit die
// Tests (src/lib/__tests__/morgenPush.test.ts) sie direkt pruefen koennen --
// gegen die Regel der Posting-Seite in src/lib/fristen.ts.

export function plusTage(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const FRISTEN = { dreh: 21, schnitt: 3, planung: 1 }

/** Brennt dieses Video? Gleiche Regel wie fristInfo() in der App, ohne Uhrzeit. */
export function brennt(v: {
  status: string; scheduled_date: string
  prep_shot?: boolean | null; prep_edited?: boolean | null; prep_scheduled?: boolean | null
  drehtag?: string | null
}, heute: string): boolean {
  if (v.status === 'posted') return false
  if (v.scheduled_date < heute) return true // verpasst
  const geplant = !!v.prep_scheduled || v.status === 'planned'
  const geschnitten = geplant || !!v.prep_edited || v.status === 'ready'
  const gedreht = geschnitten || !!v.prep_shot || (!!v.drehtag && v.drehtag < heute)
  if (geplant) return false
  if (!gedreht) {
    if (v.drehtag && v.drehtag >= heute) return false // Drehtag steht -- das ist ein Plan
    return plusTage(v.scheduled_date, -FRISTEN.dreh) <= heute
  }
  if (!geschnitten) return plusTage(v.scheduled_date, -FRISTEN.schnitt) <= heute
  return plusTage(v.scheduled_date, -FRISTEN.planung) <= heute
}

/**
 * Brennende Videos pro Kunde zusammengefasst, die meisten zuerst:
 * "Kebab Kumpels 5 · Hajo 4 · Michel 4 +2 weitere". So sieht man schon auf
 * dem Sperrbildschirm, bei wem es klemmt -- statt nur einer Gesamtzahl.
 */
export function proKunde(namen: (string | null | undefined)[], max = 3): string {
  const zahl = new Map<string, number>()
  for (const n of namen) {
    const k = (n ?? '').trim() || 'Ohne Kunde'
    zahl.set(k, (zahl.get(k) ?? 0) + 1)
  }
  const reihe = [...zahl.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const vorne = reihe.slice(0, max).map(([k, n]) => `${k} ${n}`)
  const rest = reihe.length - max
  return vorne.join(' · ') + (rest > 0 ? ` +${rest} weitere` : '')
}
