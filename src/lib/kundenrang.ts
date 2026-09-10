import { monatsplan } from './monatsplan'
import type { Client, Video } from './types'

// In welchen Topf gehoert ein Kunde gerade?
//
// Massstab ist ausschliesslich: Liegt bei UNS noch Arbeit? Ein Video, das
// fertig ist und auf seinen Posttermin wartet, zaehlt nicht als Arbeit --
// da ist von unserer Seite alles getan.
export type Rang = 'akut' | 'laeuft' | 'ruhend'

export interface Kundenlage {
  rang: Rang
  zuTun: number          // Videos mit Status "todo" -- echte Produktionsarbeit
  ohneIdee: number       // laut Vertrag zugesagt, aber nicht angelegt
  ohneLink: number       // gepostet, aber Posting-Adresse fehlt
  wartet: number         // fertig/geplant, wartet nur noch auf den Posttermin
  grund: string          // kurzer Klartext fuer die Karte
}

const tageBis = (datum: string, heute: string): number =>
  Math.round((new Date(datum + 'T00:00:00').getTime() - new Date(heute + 'T00:00:00').getTime()) / 86400000)

export function kundenlage(client: Client, videos: Video[], heute: string, tageVoraus = 7): Kundenlage {
  const plan = monatsplan(videos, client.monthly_quota, heute.slice(0, 7))

  // Produktionsarbeit: alles auf "Zu bearbeiten". Ohne Termin zaehlt es
  // immer dazu -- gerade das Unterminierte geht sonst unter.
  const zuTun = videos.filter((v) => {
    if (v.status !== 'todo') return false
    if (!v.scheduled_date) return true
    return tageBis(v.scheduled_date, heute) <= tageVoraus
  }).length

  const ohneLink = videos.filter(
    (v) => v.status === 'posted' && !v.tiktok_url && !v.instagram_url,
  ).length

  // Alles, was noch kommt: fertig und wartet auf den Termin ODER liegt
  // weiter in der Zukunft als unser Blickfeld. Beides heisst "es laeuft" --
  // nur eben nicht diese Woche.
  const zukunft = videos.filter(
    (v) => v.status !== 'posted' && (v.scheduled_date ?? '') >= heute,
  ).length
  const wartet = videos.filter(
    (v) => v.status !== 'posted' && v.status !== 'todo' && (v.scheduled_date ?? '') >= heute,
  ).length

  const gruende: string[] = []
  if (zuTun > 0) gruende.push(`${zuTun} zu drehen`)
  if (plan.ohneIdee > 0) gruende.push(`${plan.ohneIdee} ohne Idee`)
  if (ohneLink > 0) gruende.push(`${ohneLink} ohne Link`)

  let rang: Rang
  if (client.active === false) {
    rang = 'ruhend'
  } else if (gruende.length > 0) {
    rang = 'akut'
  } else if (zukunft > 0 || (client.monthly_quota ?? 0) > 0) {
    // Alles erledigt, aber es laeuft weiter -- Retainer oder ein Video,
    // das nur noch auf seinen Termin wartet.
    rang = 'laeuft'
  } else {
    // Kein Auftrag offen, nichts geplant: abgeschlossenes Projekt. Bleibt
    // als Nachschlagewerk, steht aber niemandem im Weg.
    rang = 'ruhend'
  }

  const grund = gruende.length
    ? gruende.join(' · ')
    : rang === 'laeuft'
      ? (wartet > 0
          ? `${wartet} ${wartet === 1 ? 'wartet auf Post' : 'warten auf Post'}`
          : zukunft > 0 ? `${zukunft} später geplant` : 'alles geplant')
      : 'kein offener Auftrag'

  return { rang, zuTun, ohneIdee: plan.ohneIdee, ohneLink, wartet, grund }
}

export const RANG_TITEL: Record<Rang, string> = {
  akut: 'Diese Woche dran',
  laeuft: 'Läuft — nichts zu tun',
  ruhend: 'Ruhend',
}

export const RANG_HINWEIS: Record<Rang, string> = {
  akut: 'Hier liegt Arbeit bei uns.',
  laeuft: 'Alles angelegt und geplant — wartet nur noch auf seine Termine.',
  ruhend: 'Abgeschlossen oder pausiert. Bleibt für Zahlen und Rückblicke da.',
}
