// Pausierte Kunden (Migration 0045).
//
// Wir warten auf den Kunden, koennen nicht drehen -- dann gehoert nichts von
// ihm auf "Heute", in den Plan oder in die Morgen-Nachricht. In der
// Produktion und in der Kundenakte bleibt alles sichtbar, nur abgesetzt.

export interface MitPause { pausiert_seit?: string | null; pause_grund?: string | null }

export function istPausiert(c: MitPause | null | undefined): boolean {
  return !!c?.pausiert_seit
}

/** Zeilen von pausierten Kunden rauswerfen (Zeilen ohne Kunde bleiben). */
export function ohnePausierte<T extends { clients?: MitPause | null }>(zeilen: T[]): T[] {
  return zeilen.filter((z) => !istPausiert(z.clients))
}

/** Aufteilen in laufend und pausiert -- fuer die Produktion. */
export function nachPause<T extends { clients?: MitPause | null }>(zeilen: T[]): { laufend: T[]; pausiert: T[] } {
  const laufend: T[] = []
  const pausiert: T[] = []
  for (const z of zeilen) (istPausiert(z.clients) ? pausiert : laufend).push(z)
  return { laufend, pausiert }
}

export function pauseText(c: MitPause): string {
  if (!c.pausiert_seit) return ''
  const seit = new Date(c.pausiert_seit + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  return `Pausiert seit ${seit}${c.pause_grund ? ' · ' + c.pause_grund : ''}`
}
