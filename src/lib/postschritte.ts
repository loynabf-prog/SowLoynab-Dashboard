// Der Weg eines Videos an seinem Posting-Tag -- und davor.
// ---------------------------------------------------------------------------
// Zwei Abschnitte, die klar getrennt sind:
//
//   VORHER   gedreht -> geschnitten -> eingeplant
//            Das ist Vorarbeit. Sie laesst sich Tage im Voraus erledigen,
//            und genau dafuer steht "Morgen" auf der Startseite.
//
//   AM TAG   gepostet -> beide Links eingetragen
//            Erst wenn beide Links stehen, ist der Tag wirklich durch.
//            Ohne sie holt der Nachtlauf nie Zahlen -- ein gepostetes Video
//            ohne Link ist aus unserer Sicht unsichtbar.
//
// Braucht Migration 0031 fuer die Vorarbeit. Fehlt sie, sind die drei
// Haekchen eben alle leer; der Rest funktioniert unveraendert.

import type { Video } from './types'

export type PostPhase = 'offen' | 'gepostet' | 'fertig'
export type Plattform = 'tiktok' | 'instagram'

const BEIDE: Plattform[] = ['tiktok', 'instagram']

/**
 * Auf welchen Plattformen postet ein Kunde? Nicht jeder ist auf beiden:
 * BelChicken nur TikTok, Kraftfeld nur Instagram. Ohne diese Angabe wuerde
 * ein Video dort nie "fertig", weil der zweite Link nie kommt.
 *
 * Quelle: die Accounts des Kunden (client_accounts), ersatzweise die alten
 * Handle-Spalten. Ist gar nichts hinterlegt, verlangen wir beide.
 */
export function plattformenVon(c: {
  handle_ig?: string | null
  handle_tiktok?: string | null
  client_accounts?: { platform: string }[] | null
} | null | undefined): Plattform[] {
  if (!c) return BEIDE
  const aus = new Set<Plattform>()
  for (const a of c.client_accounts ?? []) {
    if (a.platform === 'tiktok' || a.platform === 'instagram') aus.add(a.platform)
  }
  if (aus.size === 0) {
    if ((c.handle_tiktok ?? '').trim()) aus.add('tiktok')
    if ((c.handle_ig ?? '').trim()) aus.add('instagram')
  }
  return aus.size ? BEIDE.filter((p) => aus.has(p)) : BEIDE
}

/** Was Supabase zum Kunden mitliefern soll, damit plattformenVon() rechnen kann. */
export const KUNDE_SELECT = 'clients(name, handle_ig, handle_tiktok, pausiert_seit, client_type, client_accounts(platform))'
/** Rueckfall ohne Accounts-Tabelle (falls die Einbettung je scheitert). */
export const KUNDE_SELECT_EINFACH = 'clients(name, handle_ig, handle_tiktok)'

/**
 * Videos mit Kundendaten laden -- und wenn die verschachtelte Abfrage
 * scheitert, ohne die Accounts noch einmal. Lieber ungenauere Plattformen
 * als eine leere Startseite.
 */
export async function mitKundeLaden<R extends { error: unknown }>(abfrage: (kunde: string) => PromiseLike<R>): Promise<R> {
  const r = await abfrage(KUNDE_SELECT)
  return r.error ? abfrage(KUNDE_SELECT_EINFACH) : r
}

/** Plattformen an jede Zeile haengen -- direkt nach dem Laden aufrufen. */
export function mitPlattformen<T extends { clients?: Parameters<typeof plattformenVon>[0] }>(rows: T[]): (T & { plattformen: Plattform[] })[] {
  return rows.map((r) => ({ ...r, plattformen: plattformenVon(r.clients) }))
}

type LinkVideo = Pick<Video, 'tiktok_url' | 'instagram_url'> & { plattformen?: Plattform[] }

/** Wo steht das Video am Posting-Tag? */
export function postPhase(v: Pick<Video, 'status'> & LinkVideo): PostPhase {
  if (v.status !== 'posted') return 'offen'
  return beideLinksDa(v) ? 'fertig' : 'gepostet'
}

/** Sind alle Links da, die dieser Kunde braucht? */
export function beideLinksDa(v: LinkVideo): boolean {
  return fehlendeLinks(v).length === 0
}

/** Welche Adresse fehlt noch? Fuer den Hinweis an der Karte. */
export function fehlendeLinks(v: LinkVideo): Plattform[] {
  const noetig = v.plattformen && v.plattformen.length ? v.plattformen : BEIDE
  return noetig.filter((p) => !((p === 'tiktok' ? v.tiktok_url : v.instagram_url) ?? '').trim())
}

export interface VorarbeitSchritt {
  key: 'prep_shot' | 'prep_edited' | 'prep_scheduled'
  label: string
  erledigt: boolean
}

/**
 * Die drei Vorarbeits-Schritte in Arbeitsreihenfolge.
 *
 * Abhaken geht in jeder Reihenfolge -- ein spaeterer Schritt zieht die
 * frueheren nur mit (was geschnitten ist, ist gedreht). Geschrieben wird
 * ueber vorarbeitPatch() in statusSync.ts.
 */
export function vorarbeit(v: Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled' | 'status'>>): VorarbeitSchritt[] {
  // Der Board-Status zaehlt mit: eine Karte in "Geplant" ist eingeplant,
  // auch wenn das Haekchen (noch) fehlt -- und ein spaeterer Schritt
  // schliesst die frueheren ein. Gleiche Regel wie stand() in fristen.ts.
  const eingeplant = !!v.prep_scheduled || v.status === 'planned' || v.status === 'posted'
  const geschnitten = eingeplant || !!v.prep_edited || v.status === 'ready'
  const gedreht = geschnitten || !!v.prep_shot
  return [
    { key: 'prep_shot', label: 'Gedreht', erledigt: gedreht },
    { key: 'prep_edited', label: 'Geschnitten', erledigt: geschnitten },
    { key: 'prep_scheduled', label: 'Eingeplant', erledigt: eingeplant },
  ]
}

export function vorarbeitFertig(v: Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled' | 'status'>>): boolean {
  return vorarbeit(v).every((s) => s.erledigt)
}

/** Wie viele der drei Schritte stehen? Fuer die Zahl an der Karte. */
export function vorarbeitStand(v: Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled' | 'status'>>): number {
  return vorarbeit(v).filter((s) => s.erledigt).length
}

/**
 * Ein Satz, der sagt, was als Naechstes dran ist. Steht an der Karte,
 * damit niemand erst ueberlegen muss, wo er gerade steht.
 */
export function naechsterSchritt(v: Pick<Video, 'status'> & LinkVideo & Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled'>>): string {
  const phase = postPhase(v)
  if (phase === 'fertig') return 'Erledigt'
  if (phase === 'gepostet') {
    const fehlt = fehlendeLinks(v)
    if (fehlt.length === 2) return 'Beide Links eintragen'
    if (fehlt.length === 0) return 'Erledigt'
    return fehlt[0] === 'tiktok' ? 'TikTok-Link eintragen' : 'Instagram-Link eintragen'
  }
  const offen = vorarbeit(v).find((s) => !s.erledigt)
  return offen ? offen.label.replace(/^Ge/, 'Noch ge') : 'Posten'
}

/**
 * Zaehlt zusammen, was heute noch zu tun ist: ein Video gilt als offen,
 * solange nicht beide Links drin sind.
 */
export function offeneHeute(videos: (Pick<Video, 'status'> & LinkVideo)[]): number {
  return videos.filter((v) => postPhase(v) !== 'fertig').length
}
