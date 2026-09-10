// Fehlende Videos automatisch anlegen: gleichmaessig ueber die Resttage des
// Monats verteilt, mit fortlaufenden Platzhalter-Namen ("September 6" …).
//
// Der Name ist bewusst ein Platzhalter und keine erfundene Idee — die Karte
// steht schon im Board, damit die Menge stimmt; die Idee traegt der Mensch
// nach. Die Nummerierung startet in jedem Monat neu, sonst waere man im
// Dezember bei Nummer 180.

const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function monatsName(key: string): string {
  const m = Number(key.slice(5, 7))
  return MONATE[m - 1] ?? key
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Erkennt eine Platzhalter-Karte ("September 7") — daran sieht man im Board,
// wo noch eine echte Idee fehlt.
export function istPlatzhalter(titel: string): boolean {
  return new RegExp(`^(${MONATE.join('|')})\\s+\\d+$`).test(titel.trim())
}

// Hoechste bereits vergebene Nummer in diesem Monat, damit ein zweiter
// Durchlauf nicht wieder bei 1 anfaengt.
export function hoechsteNummer(titel: string[], key: string): number {
  const name = monatsName(key)
  const re = new RegExp(`^${name}\\s+(\\d+)$`)
  let max = 0
  for (const t of titel) {
    const m = t.trim().match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

export interface PlanZeile { title: string; scheduled_date: string }

/**
 * Verteilt `anzahl` neue Videos gleichmaessig auf die noch freien Tage des
 * Monats. Tage, an denen fuer diesen Kunden schon ein Video liegt, werden
 * uebersprungen — sonst haeuft sich alles auf einem Datum.
 *
 * @param abTag  frühestes Datum (i. d. R. heute); liegt es vor dem Monat,
 *               wird der Monatsanfang genommen
 */
export function verteilePlan(opts: {
  anzahl: number
  monatsKey: string           // "2026-09"
  abTag: string               // "2026-09-10"
  belegteTage: string[]       // vorhandene scheduled_date desselben Kunden
  vorhandeneTitel: string[]
}): PlanZeile[] {
  const { anzahl, monatsKey, abTag, belegteTage, vorhandeneTitel } = opts
  if (anzahl <= 0) return []

  const jahr = Number(monatsKey.slice(0, 4))
  const monat = Number(monatsKey.slice(5, 7))
  const letzterTag = new Date(jahr, monat, 0).getDate()
  const ersterMoeglich = abTag.slice(0, 7) === monatsKey ? Number(abTag.slice(8, 10)) : 1

  const belegt = new Set(belegteTage.filter((d) => d.slice(0, 7) === monatsKey))
  const frei: string[] = []
  for (let tag = ersterMoeglich; tag <= letzterTag; tag++) {
    const d = iso(new Date(jahr, monat - 1, tag))
    if (!belegt.has(d)) frei.push(d)
  }
  if (frei.length === 0) return []

  // Gleichmaessig ueber die freien Tage streuen. Sind es weniger freie Tage
  // als Videos, werden Tage doppelt belegt — lieber zwei an einem Tag als
  // gar nicht angelegt.
  const gewaehlt: string[] = []
  for (let i = 0; i < anzahl; i++) {
    const pos = frei.length >= anzahl
      ? Math.round((i * (frei.length - 1)) / Math.max(1, anzahl - 1))
      : Math.floor((i * frei.length) / anzahl)
    gewaehlt.push(frei[Math.min(pos, frei.length - 1)])
  }

  const name = monatsName(monatsKey)
  const start = hoechsteNummer(vorhandeneTitel, monatsKey)
  return gewaehlt.map((d, i) => ({ title: `${name} ${start + i + 1}`, scheduled_date: d }))
}
