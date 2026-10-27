// Pipeline: wo jedes Video zwischen Dreh und Posting gerade steht.
// -------------------------------------------------------------------------
// Fassie will draufschauen und sehen: diese 10 Rohschnitte laufen nacheinander
// durch die Automatik, diese 2 warten auf mich, diese 3 hat Lion -- ohne sich
// darum kuemmern zu muessen. Hier steckt nur die Zuordnung (testbar), die
// Darstellung macht components/PipelineKarte.tsx.
//
//   Eingang      Drehtag abgeschlossen, Material wartet auf die Automatik
//   Automatik    Claude schneidet: Auftraege, die laufen; Videos im Rohschnitt
//                (produktion_stufe 'roh'); Aenderungswuensche in Arbeit
//   Freigabe     Vorschau fertig, Fassie schaut (produktion_stufe 'pruefung')
//   Feinschliff  Lion (produktion_stufe 'feinschliff')
//   Fertig       Export da, noch nicht eingeplant (produktion_stufe 'fertig')
//   Eingeplant   Termin steht (status 'planned')
//
// Innerhalb einer Stufe: zahlende Kunden vor Personal Brand vor Ehrenamt,
// dann nach Posting-Tag -- dieselbe Prioritaet wie ueberall.

import { rangVon } from './kundenart'

export type StufeKey = 'eingang' | 'automatik' | 'freigabe' | 'feinschliff' | 'fertig' | 'eingeplant'

export interface StufeInfo { key: StufeKey; titel: string; wer: string; leer: string; /** Ein Wort unter dem Symbol */ kurz: string }

export const PIPELINE: StufeInfo[] = [
  { key: 'eingang',     titel: 'Eingang',     wer: 'Material',  leer: 'Kein Drehtag offen' , kurz: 'Eingang' },
  { key: 'automatik',   titel: 'Rohschnitt',  wer: 'Automatik', leer: 'Nichts im Schnitt' , kurz: 'Schnitt' },
  { key: 'freigabe',    titel: 'Freigabe',    wer: 'Fassie',    leer: 'Nichts zu prüfen' , kurz: 'Fassie' },
  { key: 'feinschliff', titel: 'Feinschliff', wer: 'Lion',      leer: 'Nichts bei Lion' , kurz: 'Lion' },
  { key: 'fertig',      titel: 'Fertig',      wer: 'Einplanen', leer: 'Nichts wartet aufs Einplanen' , kurz: 'Fertig' },
  { key: 'eingeplant',  titel: 'Eingeplant',  wer: 'Geht raus', leer: 'Nichts eingeplant' , kurz: 'Geplant' },
]

export interface PipeVideo {
  id: string
  title: string | null
  client_id: string
  status: string
  produktion_stufe: string | null
  scheduled_date: string | null
  updated_at?: string | null
  clients?: { name: string; logo_url?: string | null; client_type?: string | null } | null
}
export interface PipeAuftrag {
  id: string
  client_id: string
  status: string
  schritt: string | null
  dateien: number | null
  drehtag: string | null
  created_at: string
  clients?: { name: string; logo_url?: string | null; client_type?: string | null } | null
}
export interface PipeAenderung { id: string; video_id: string; status: string; wunsch: string; created_at: string }

/** Eine Karte in der Pipeline: ein Video oder ein Drehtag-Auftrag. */
export interface PipeEintrag {
  key: string
  art: 'video' | 'auftrag'
  id: string
  clientId: string
  kunde: string
  logo: string | null
  titel: string
  unter: string
  datum: string | null
  /** In der Automatik: laeuft gerade (true) oder wartet in der Schlange. */
  laeuft?: boolean
  /** Platz in der Automatik-Schlange (1 = laeuft/als naechstes). */
  platz?: number
  rang: number
}

export type Pipeline = Record<StufeKey, PipeEintrag[]>

function tagKurz(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

function nachPrio(a: PipeEintrag, b: PipeEintrag): number {
  return a.rang - b.rang || (a.datum ?? '9999').localeCompare(b.datum ?? '9999') || a.titel.localeCompare(b.titel)
}

export function bauePipeline(videos: PipeVideo[], auftraege: PipeAuftrag[], aenderungen: PipeAenderung[]): Pipeline {
  const p: Pipeline = { eingang: [], automatik: [], freigabe: [], feinschliff: [], fertig: [], eingeplant: [] }

  // Aenderungswuensche in Arbeit: das Video gehoert solange zur Automatik.
  const wunschJe = new Map<string, PipeAenderung>()
  for (const a of aenderungen) {
    if (a.status !== 'offen' && a.status !== 'laeuft') continue
    const vorher = wunschJe.get(a.video_id)
    if (!vorher || a.status === 'laeuft') wunschJe.set(a.video_id, a)
  }

  for (const a of auftraege) {
    const e: PipeEintrag = {
      key: `a-${a.id}`, art: 'auftrag', id: a.id, clientId: a.client_id,
      kunde: a.clients?.name ?? 'Kunde', logo: a.clients?.logo_url ?? null,
      titel: `Drehtag ${tagKurz(a.drehtag) ?? ''}`.trim(),
      unter: a.status === 'laeuft' ? (a.schritt || 'Wird sortiert und geschnitten') : `${a.dateien ?? '?'} Clips warten`,
      datum: a.drehtag, laeuft: a.status === 'laeuft', rang: rangVon(a.clients?.client_type),
    }
    if (a.status === 'wartet') p.eingang.push(e)
    else if (a.status === 'laeuft') p.automatik.push(e)
  }

  for (const v of videos) {
    if (v.status === 'posted') continue
    const basis = {
      key: `v-${v.id}`, art: 'video' as const, id: v.id, clientId: v.client_id,
      kunde: v.clients?.name ?? 'Kunde', logo: v.clients?.logo_url ?? null,
      titel: v.title || 'Video', datum: v.scheduled_date, rang: rangVon(v.clients?.client_type),
    }
    const termin = v.scheduled_date ? `Post ${tagKurz(v.scheduled_date)}` : 'noch ohne Termin'
    const wunsch = wunschJe.get(v.id)
    if (wunsch) {
      p.automatik.push({ ...basis, unter: `Änderung: ${wunsch.wunsch}`, laeuft: wunsch.status === 'laeuft' })
      continue
    }
    switch (v.produktion_stufe) {
      case 'roh': p.automatik.push({ ...basis, unter: `Rohschnitt · ${termin}`, laeuft: false }); break
      case 'pruefung': p.freigabe.push({ ...basis, unter: `Vorschau ansehen · ${termin}` }); break
      case 'feinschliff': p.feinschliff.push({ ...basis, unter: termin }); break
      case 'fertig':
        if (v.status === 'planned') p.eingeplant.push({ ...basis, unter: termin })
        else p.fertig.push({ ...basis, unter: `Fertig · ${termin}` })
        break
      default:
        if (v.status === 'planned') p.eingeplant.push({ ...basis, unter: termin })
    }
  }

  for (const k of Object.keys(p) as StufeKey[]) p[k].sort(nachPrio)

  // Automatik-Schlange: was laeuft, zuerst; danach die Reihenfolge, in der
  // abgearbeitet wird (eins nach dem anderen, nie gleichzeitig).
  p.automatik.sort((a, b) => Number(!!b.laeuft) - Number(!!a.laeuft) || nachPrio(a, b))
  p.automatik.forEach((e, i) => { e.platz = i + 1 })
  return p
}

/** Kurzer Satz fuer die Automatik, damit man sieht: laeuft, keine Sorge. */
export function automatikSatz(p: Pipeline): string {
  const n = p.automatik.length
  if (n === 0) return p.eingang.length ? 'Startet, sobald der Drehtag abgeholt wird' : 'Gerade nichts zu schneiden'
  const laeuft = p.automatik.filter((e) => e.laeuft).length
  const wartet = n - laeuft
  if (laeuft === 0) return `${n} in der Schlange – startet gleich`
  return wartet ? `1 läuft gerade, ${wartet} ${wartet === 1 ? 'wartet' : 'warten'} – alles automatisch` : '1 läuft gerade'
}
