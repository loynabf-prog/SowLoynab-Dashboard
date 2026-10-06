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

/** Wo steht das Video am Posting-Tag? */
export function postPhase(v: Pick<Video, 'status' | 'tiktok_url' | 'instagram_url'>): PostPhase {
  if (v.status !== 'posted') return 'offen'
  return beideLinksDa(v) ? 'fertig' : 'gepostet'
}

export function beideLinksDa(v: Pick<Video, 'tiktok_url' | 'instagram_url'>): boolean {
  return !!(v.tiktok_url ?? '').trim() && !!(v.instagram_url ?? '').trim()
}

/** Welche Adresse fehlt noch? Fuer den Hinweis an der Karte. */
export function fehlendeLinks(v: Pick<Video, 'tiktok_url' | 'instagram_url'>): ('tiktok' | 'instagram')[] {
  const out: ('tiktok' | 'instagram')[] = []
  if (!(v.tiktok_url ?? '').trim()) out.push('tiktok')
  if (!(v.instagram_url ?? '').trim()) out.push('instagram')
  return out
}

export interface VorarbeitSchritt {
  key: 'prep_shot' | 'prep_edited' | 'prep_scheduled'
  label: string
  erledigt: boolean
}

/**
 * Die drei Vorarbeits-Schritte in Arbeitsreihenfolge.
 *
 * Bewusst ohne Zwang: wer zuerst schneidet und dann nachdreht, hakt eben in
 * anderer Reihenfolge ab. Die App soll mitschreiben, nicht erziehen.
 */
export function vorarbeit(v: Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled'>>): VorarbeitSchritt[] {
  return [
    { key: 'prep_shot', label: 'Gedreht', erledigt: !!v.prep_shot },
    { key: 'prep_edited', label: 'Geschnitten', erledigt: !!v.prep_edited },
    { key: 'prep_scheduled', label: 'Eingeplant', erledigt: !!v.prep_scheduled },
  ]
}

export function vorarbeitFertig(v: Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled'>>): boolean {
  return vorarbeit(v).every((s) => s.erledigt)
}

/** Wie viele der drei Schritte stehen? Fuer die Zahl an der Karte. */
export function vorarbeitStand(v: Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled'>>): number {
  return vorarbeit(v).filter((s) => s.erledigt).length
}

/**
 * Ein Satz, der sagt, was als Naechstes dran ist. Steht an der Karte,
 * damit niemand erst ueberlegen muss, wo er gerade steht.
 */
export function naechsterSchritt(v: Pick<Video, 'status' | 'tiktok_url' | 'instagram_url'> & Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled'>>): string {
  const phase = postPhase(v)
  if (phase === 'fertig') return 'Erledigt'
  if (phase === 'gepostet') {
    const fehlt = fehlendeLinks(v)
    if (fehlt.length === 2) return 'Beide Links eintragen'
    return fehlt[0] === 'tiktok' ? 'TikTok-Link eintragen' : 'Instagram-Link eintragen'
  }
  const offen = vorarbeit(v).find((s) => !s.erledigt)
  return offen ? offen.label.replace(/^Ge/, 'Noch ge') : 'Posten'
}

/**
 * Zaehlt zusammen, was heute noch zu tun ist: ein Video gilt als offen,
 * solange nicht beide Links drin sind.
 */
export function offeneHeute(videos: Pick<Video, 'status' | 'tiktok_url' | 'instagram_url'>[]): number {
  return videos.filter((v) => postPhase(v) !== 'fertig').length
}
