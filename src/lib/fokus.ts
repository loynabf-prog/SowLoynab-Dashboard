// Aus der Tageslage wird ein Tag, der sich machen laesst.
// ---------------------------------------------------------------------------
// tageslage.ts sagt, WAS ansteht. Diese Datei entscheidet, was man davon
// SIEHT: eine Sache im Fokus, drei danach, der Rest auf Abruf. Dazu ein
// Tagesziel von hoechstens fuenf Sachen -- genug, dass immer etwas zu tun
// ist, wenig genug, dass niemand vor einer Wand aus 26 roten Punkten steht.

import type { Lage, Punkt } from './tageslage'

export const TAGESZIEL = 5
export const DANACH = 3

/** Gehoert ein Eintrag mir? Niemandem zugeordnet heisst: allen. */
export function gehoertMir(ids: string[] | null | undefined, memberId: string | null): boolean {
  if (!memberId) return true
  if (!ids || ids.length === 0) return true
  return ids.includes(memberId)
}

export interface Tag {
  fokus: Punkt | null
  danach: Punkt[]
  /** Alles, was nach Fokus und den drei folgenden noch offen ist. */
  rest: Punkt[]
  /** Nichts Dringendes: dann zeigen wir Vorarbeit als Angebot. */
  ruhig: boolean
  ziel: number
  geschafft: number
}

/**
 * @param spaeter  Schluessel, die man mit "Spaeter" nach hinten geschoben hat
 * @param geschafft  heute bereits Erledigtes
 */
export function machTag(l: Lage, spaeter: string[], geschafft: number): Tag {
  const dran = [...l.brennt, ...l.heute]
  const reihe = l.ruhig ? [...l.vorarbeit] : dran
  // "Spaeter" schiebt ans Ende, in der Reihenfolge, in der man es geschoben hat.
  const vorne = reihe.filter((p) => !spaeter.includes(p.key))
  const hinten = spaeter.map((k) => reihe.find((p) => p.key === k)).filter(Boolean) as Punkt[]
  const geordnet = [...vorne, ...hinten]

  const offen = dran.length
  const ziel = Math.max(1, Math.min(TAGESZIEL, geschafft + offen))
  return {
    fokus: geordnet[0] ?? null,
    danach: geordnet.slice(1, 1 + DANACH),
    rest: geordnet.slice(1 + DANACH),
    ruhig: l.ruhig,
    ziel,
    geschafft,
  }
}

/** Ein Satz unter dem Ring. */
export function ringSatz(t: Tag): { oben: string; unten: string } {
  if (t.geschafft >= t.ziel && t.ziel > 0 && !t.ruhig) {
    return { oben: 'Tagesziel geschafft', unten: 'Alles Weitere ist Vorsprung.' }
  }
  if (t.ruhig && t.geschafft === 0) {
    return { oben: 'Nichts brennt', unten: t.fokus ? 'Zeit, den nächsten Tagen Arbeit abzunehmen.' : 'Alles erledigt. Genieß den Tag.' }
  }
  if (t.ruhig) return { oben: `${t.geschafft} erledigt`, unten: 'Nichts brennt mehr. Stark.' }
  const noch = t.ziel - t.geschafft
  return {
    oben: `${t.geschafft} von ${t.ziel} geschafft`,
    unten: noch === 1 ? 'Noch eine Sache bis zum Tagesziel.' : `Noch ${noch} Sachen bis zum Tagesziel.`,
  }
}
