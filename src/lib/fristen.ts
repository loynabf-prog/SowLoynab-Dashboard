// Fristen-Ampel: wie weit muss ein Video sein, gemessen am Posting-Tag?
// ---------------------------------------------------------------------------
// Unsere Vorlaufzeiten, rueckwaerts vom Posting-Tag gerechnet:
//
//   gedreht      spaetestens 21 Tage vorher
//   geschnitten  spaetestens  3 Tage vorher
//   eingeplant   spaetestens  1 Tag  vorher
//
// Der Kunde sieht nur das Posting. Ob wir drei Wochen oder einen Abend
// vorher schneiden, merkt er nicht -- wohl aber, wenn am Tag nichts kommt.
// Diese Ampel sorgt dafuer, dass wir das Wochen vorher sehen, nicht am
// Vorabend.
//
// Rein rechnerisch, keine eigene Spalte: alles kommt aus scheduled_date,
// status und den drei Vorarbeit-Haekchen (Migration 0031).

import type { Video } from './types'
import { datumPlus } from './datum'

export const FRISTEN = { dreh: 21, schnitt: 3, planung: 1 } as const

/** Dreh-Frist und Dreh-Erinnerungen an? Seit Okt 2026 aus. */
export const DREH_ERINNERUNG = false

/** Ab wie vielen Tagen vor der Frist wird es gelb? */
export const VORWARNUNG = { dreh: 7, schnitt: 2, planung: 1 } as const

export type Ampel = 'rot' | 'gelb' | 'gruen' | 'erledigt' | 'ohne-termin'
export type Schritt = 'dreh' | 'schnitt' | 'planung' | 'posten'

const SCHRITT_LABEL: Record<Schritt, string> = {
  dreh: 'Drehen',
  schnitt: 'Schneiden',
  planung: 'Einplanen',
  posten: 'Posten',
}

type FristVideo = Pick<Video, 'status' | 'scheduled_date'> &
  Partial<Pick<Video, 'prep_shot' | 'prep_edited' | 'prep_scheduled' | 'scheduled_time'>> & {
    /** Datum des verknuepften Drehtags (events.starts_on), falls vorhanden. */
    drehtag?: string | null
  }

/**
 * Was ist wirklich schon getan? Spaetere Schritte schliessen fruehere ein:
 * wer eingeplant hat, hat auch geschnitten und gedreht. Der Board-Status
 * zaehlt mit, damit alte Videos ohne Haekchen nicht faelschlich rot werden.
 */
export function stand(v: FristVideo, heuteIso?: string) {
  const geplant = !!v.prep_scheduled || v.status === 'planned' || v.status === 'posted'
  const geschnitten = geplant || !!v.prep_edited || v.status === 'ready'
  // Ein vergangener Drehtag zaehlt als gedreht, auch ohne Haekchen.
  const drehtagVorbei = !!v.drehtag && !!heuteIso && v.drehtag < heuteIso
  const gedreht = geschnitten || !!v.prep_shot || drehtagVorbei
  return { gedreht, geschnitten, geplant, gepostet: v.status === 'posted' }
}

/** Tage von a bis b (b - a), beide als YYYY-MM-DD. */
export function tageZwischen(a: string, b: string): number {
  const ms = new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
}

export interface FristInfo {
  ampel: Ampel
  /** Der naechste offene Schritt -- null, wenn gepostet oder ohne Termin. */
  schritt: Schritt | null
  /** Bis wann dieser Schritt erledigt sein muss. */
  frist: string | null
  /** Tage bis zur Frist; negativ = so viele Tage drueber. */
  tageBisFrist: number | null
  /** Ein kurzer Satz fuer die Karte. */
  text: string
}

function kurz(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}.`
}

/**
 * @param jetztZeit  aktuelle Uhrzeit "HH:MM" (deutsche Zeit). Ist sie
 *                   angegeben und die Post-Uhrzeit heute schon vorbei, ist
 *                   ein noch nicht gepostetes Video rot.
 */
export function fristInfo(v: FristVideo, heuteIso: string, jetztZeit?: string): FristInfo {
  const s = stand(v, heuteIso)
  if (s.gepostet) return { ampel: 'erledigt', schritt: null, frist: null, tageBisFrist: null, text: 'Gepostet' }
  if (!v.scheduled_date) {
    return { ampel: 'ohne-termin', schritt: null, frist: null, tageBisFrist: null, text: 'Kein Posting-Tag' }
  }
  const tag = v.scheduled_date

  let schritt: Schritt
  let frist: string
  // Keine Dreh-Frist mehr (Fassie, Okt 2026): wann gedreht wird, ist unsere
  // Sache. Ungedrehte Videos melden sich erst, wenn der Schnitt faellig
  // wird -- dann ist es ein echtes Problem, vorher nur Stress.
  if (!s.gedreht && !DREH_ERINNERUNG) { schritt = 'schnitt'; frist = datumPlus(tag, -FRISTEN.schnitt) }
  else if (!s.gedreht) { schritt = 'dreh'; frist = datumPlus(tag, -FRISTEN.dreh) }
  else if (!s.geschnitten) { schritt = 'schnitt'; frist = datumPlus(tag, -FRISTEN.schnitt) }
  else if (!s.geplant) { schritt = 'planung'; frist = datumPlus(tag, -FRISTEN.planung) }
  else { schritt = 'posten'; frist = tag }

  const rest = tageZwischen(heuteIso, frist)
  const label = schritt === 'schnitt' && !s.gedreht ? 'Drehen & Schneiden' : SCHRITT_LABEL[schritt]

  // Der Posting-Tag ist vorbei und nichts kam raus: das ist der Ernstfall.
  if (tageZwischen(heuteIso, tag) < 0) {
    return { ampel: 'rot', schritt, frist, tageBisFrist: rest, text: `Posting verpasst (${kurz(tag)})` }
  }

  // Heute, und die geplante Uhrzeit ist vorbei: jetzt brennt es wirklich.
  const zeit = (v.scheduled_time ?? '').slice(0, 5)
  if (tag === heuteIso && jetztZeit && zeit && jetztZeit > zeit) {
    return {
      ampel: 'rot', schritt, frist, tageBisFrist: rest,
      text: schritt === 'posten' ? `Post-Zeit ${zeit} vorbei — posten!` : `${label} offen, Post-Zeit ${zeit} vorbei`,
    }
  }

  if (schritt === 'posten') {
    return {
      ampel: 'gruen', schritt, frist, tageBisFrist: rest,
      text: rest === 0 ? 'Bereit — heute posten' : 'Fertig eingeplant',
    }
  }

  // Noch nicht gedreht, aber ein Drehtag ist eingetragen: das ist ein Plan.
  if (schritt === 'dreh' && v.drehtag && v.drehtag >= heuteIso) {
    const passt = v.drehtag <= frist
    return {
      ampel: passt ? 'gruen' : 'gelb', schritt, frist, tageBisFrist: rest,
      text: passt ? `Drehtag am ${kurz(v.drehtag)}` : `Drehtag erst am ${kurz(v.drehtag)} — knapp`,
    }
  }

  let ampel: Ampel
  let text: string
  if (rest < 0) {
    ampel = 'rot'
    text = `${label} überfällig seit ${-rest} ${-rest === 1 ? 'Tag' : 'Tagen'}`
  } else if (rest === 0) {
    ampel = 'rot'
    text = `${label} — heute letzter Tag`
  } else if (rest <= VORWARNUNG[schritt]) {
    ampel = 'gelb'
    text = `${label} bis ${kurz(frist)} (noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'})`
  } else {
    ampel = 'gruen'
    text = `${label} bis ${kurz(frist)}`
  }
  return { ampel, schritt, frist, tageBisFrist: rest, text }
}

const RANG: Record<Ampel, number> = { rot: 0, gelb: 1, gruen: 2, 'ohne-termin': 3, erledigt: 4 }

/** Dringendes zuerst, innerhalb gleicher Farbe nach Posting-Tag. */
export function nachDringlichkeit<T extends FristVideo>(videos: T[], heuteIso: string, jetztZeit?: string): T[] {
  return [...videos].sort((a, b) => {
    const fa = fristInfo(a, heuteIso, jetztZeit)
    const fb = fristInfo(b, heuteIso, jetztZeit)
    if (RANG[fa.ampel] !== RANG[fb.ampel]) return RANG[fa.ampel] - RANG[fb.ampel]
    return (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999')
  })
}

const UHR = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false })

/** Aktuelle Uhrzeit in deutscher Zeit als "HH:MM". */
export function jetztUhrzeit(d: Date = new Date()): string {
  return UHR.format(d)
}
