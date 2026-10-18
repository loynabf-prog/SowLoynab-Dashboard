// Board-Status und Vorarbeit-Haekchen gehoeren zusammen.
// ---------------------------------------------------------------------------
// Es gibt zwei Darstellungen desselben Stands:
//   * den Board-Status in der Kundenakte (Zu bearbeiten / Bereit / Geplant /
//     Gepostet), den man per Ziehen setzt
//   * die Haekchen gedreht / geschnitten / eingeplant auf der Startseite,
//     im Posting- und im Produktions-Bereich
// Frueher lief beides auseinander: Karte nach "Geplant" gezogen -> kein
// Haken; "Eingeplant" abgehakt -> Karte blieb in "Zu bearbeiten". Diese zwei
// reinen Funktionen sind die eine Regel, nach der jede Stelle schreibt.

import type { Video, VideoStatus } from './types'

export type VorarbeitKey = 'prep_shot' | 'prep_edited' | 'prep_scheduled'

type Stand = Pick<Video, 'status'> & Partial<Pick<Video, VorarbeitKey>>

export interface VorarbeitPatch {
  prep_shot: boolean
  prep_edited: boolean
  prep_scheduled: boolean
  status?: VideoStatus
}

/**
 * Ein Haekchen setzen oder wegnehmen.
 * Spaeterer Schritt schliesst frueheren ein; wird ein frueherer Schritt
 * weggenommen, fallen die spaeteren mit. Der Status folgt -- ein bereits
 * gepostetes Video bleibt gepostet.
 */
export function vorarbeitPatch(v: Stand, key: VorarbeitKey, wert: boolean): VorarbeitPatch {
  let shot = !!v.prep_shot
  let edited = !!v.prep_edited
  let scheduled = !!v.prep_scheduled

  if (key === 'prep_shot') shot = wert
  if (key === 'prep_edited') edited = wert
  if (key === 'prep_scheduled') scheduled = wert

  if (!wert) {
    if (key === 'prep_shot') { edited = false; scheduled = false }
    if (key === 'prep_edited') scheduled = false
  } else {
    if (scheduled) edited = true
    if (edited) shot = true
  }

  if (v.status === 'posted') return { prep_shot: true, prep_edited: true, prep_scheduled: true }
  const status: VideoStatus = scheduled ? 'planned' : edited ? 'ready' : 'todo'
  return { prep_shot: shot, prep_edited: edited, prep_scheduled: scheduled, status }
}

/** Karte auf einen Status gezogen: die Haekchen folgen. */
export function statusFolgen(status: VideoStatus, v: Partial<Pick<Video, 'prep_shot'>> = {}): Omit<VorarbeitPatch, 'status'> {
  switch (status) {
    case 'posted':
    case 'planned':
      return { prep_shot: true, prep_edited: true, prep_scheduled: true }
    case 'ready':
      return { prep_shot: true, prep_edited: true, prep_scheduled: false }
    default:
      // "Zu bearbeiten": gedreht kann es trotzdem schon sein.
      return { prep_shot: !!v.prep_shot, prep_edited: false, prep_scheduled: false }
  }
}
