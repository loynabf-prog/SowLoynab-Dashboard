// Schnitt-Raum: Helfer fuer Liste und Korrektur-Player (0081).
// Fassie 17.11.2026: Kunden -> Videos, nach Deadline; im Player pausieren,
// Text schreiben, Claude weiss die genaue Sekunde.

import { dropbox, type Eintrag } from './medien'

export interface Kommentar {
  id: string
  video_id: string
  datei: string | null
  sekunde: number
  bis_sekunde: number | null
  x: number | null
  y: number | null
  text: string
  erledigt: boolean
  aenderung_id: string | null
  member_id: string | null
  created_at: string
}

export const FPS = 30

/** 12.4 -> "0:12,4" (Zehntel reichen zum Finden, gespeichert wird auf 1/100) */
export function zeit(s: number): string {
  const t = Math.max(0, s)
  const m = Math.floor(t / 60)
  const rest = t - m * 60
  const sek = Math.floor(rest)
  const zehntel = Math.floor((rest - sek) * 10)
  return `${m}:${String(sek).padStart(2, '0')},${zehntel}`
}

/** Deadline-Ampel: ueberfaellig / bald (<= 2 Tage) / ok / ohne */
export function deadlineLage(datum: string | null, heute: string): 'ueber' | 'bald' | 'ok' | 'ohne' {
  if (!datum) return 'ohne'
  if (datum < heute) return 'ueber'
  const tage = (Date.parse(datum) - Date.parse(heute)) / 86400_000
  return tage <= 2 ? 'bald' : 'ok'
}

export function deadlineText(datum: string | null, heute: string): string {
  if (!datum) return 'ohne Termin'
  const tage = Math.round((Date.parse(datum) - Date.parse(heute)) / 86400_000)
  if (tage === 0) return 'heute'
  if (tage === 1) return 'morgen'
  if (tage === -1) return 'seit gestern'
  if (tage < 0) return `seit ${-tage} Tagen`
  if (tage < 7) return `in ${tage} Tagen`
  return new Date(datum + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

/** Der Bestellzettel fuer Claude: jede Anmerkung mit Sekunde (und Stelle im Bild). */
export function korrekturText(titel: string, kunde: string, datei: string | null, liste: Kommentar[]): string {
  const zeilen = [...liste]
    .sort((a, b) => a.sekunde - b.sekunde)
    .map((k) => {
      const wann = k.bis_sekunde != null ? `${zeit(k.sekunde)}–${zeit(k.bis_sekunde)}` : zeit(k.sekunde)
      const wo = k.x != null && k.y != null ? ` [Stelle im Bild: ${Math.round(k.x * 100)} % von links, ${Math.round(k.y * 100)} % von oben]` : ''
      return `• ${wann} (${k.sekunde.toFixed(2)} s)${wo}: ${k.text.trim()}`
    })
  return [
    `Korrekturen ${kunde} – ${titel}`,
    datei ? `Vorschau: ${datei}` : null,
    '',
    ...zeilen,
  ].filter((z) => z !== null).join('\n')
}

/** Vorschau-Dateien eines Videos aus Dropbox, neueste zuerst (Vorschau*.mp4 bevorzugt). */
export async function vorschauDateien(ordner: string[]): Promise<Eintrag[]> {
  const alle: Eintrag[] = []
  for (const o of ordner) {
    try {
      const liste = await dropbox.liste(o)
      alle.push(...liste.filter((e) => e.art === 'video'))
      for (const unter of liste.filter((e) => e.ordner && /vorschau|export|render/i.test(e.name))) {
        try { alle.push(...(await dropbox.liste(unter.pfad)).filter((e) => e.art === 'video')) } catch { /* egal */ }
      }
      if (alle.length) break
    } catch { /* Ordner fehlt: naechsten probieren */ }
  }
  const punkte = (e: Eintrag) => (/vorschau|preview/i.test(e.name) ? 1 : 0)
  return alle.sort((a, b) => punkte(b) - punkte(a) || (b.geaendert ?? '').localeCompare(a.geaendert ?? ''))
}
