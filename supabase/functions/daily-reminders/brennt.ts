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
