// Was ist HEUTE zu tun -- und wenn nichts brennt, was koennen wir vorziehen?
// ---------------------------------------------------------------------------
// Der alte Startbildschirm war nach dem Posting-Tag sortiert. Das ist aber
// nicht der Tag, an dem die Arbeit anfaellt: ein Video, das in drei Tagen
// rausgeht, muss HEUTE geschnitten werden -- und tauchte nirgends auf, weil
// sein Posting-Tag nicht heute ist. Genau daran geht eine Woche verloren.
//
// Diese Datei beantwortet drei Fragen, in dieser Reihenfolge:
//
//   1. Was brennt?      Fristen gerissen, Posting verpasst, Post-Zeit vorbei.
//   2. Was ist heute?   Termine, Drehtage, Posts, Fristen die heute enden.
//   3. Was geht vor?    Nichts brennt -- was kann ich schon mal wegarbeiten?
//
// Punkt 3 ist der eigentliche Gewinn: ein ruhiger Tag soll nicht als "nichts
// zu tun" erscheinen, sondern als Gelegenheit, den naechsten zu entlasten.

import { fristInfo, stand, tageZwischen, NUR_POSTEN, type Ampel, type Schritt } from './fristen'
import type { VideoStatus } from './types'
import { datumPlus } from './datum'

export type Art = 'termin' | 'drehtag' | 'posten' | 'dreh' | 'schnitt' | 'planung' | 'aufgabe'

export interface LageVideo {
  id: string
  title: string
  status: VideoStatus
  scheduled_date: string | null
  scheduled_time?: string | null
  prep_shot?: boolean
  prep_edited?: boolean
  prep_scheduled?: boolean
  client_id?: string | null
  clients?: { name: string; client_type?: string | null } | null
  drehtag?: string | null
}

export interface LageTermin {
  id: string
  title: string
  kind: string | null
  starts_on: string
  starts_at?: string | null
  planned_videos?: number | null
  client_id?: string | null
  clients?: { name: string } | null
}

export interface LageAufgabe {
  id: string
  title: string
  due_date: string | null
  due_time?: string | null
  priority?: number | null
  clients?: { name: string } | null
  leads?: { name: string } | null
}

export interface Punkt {
  key: string
  id: string
  art: Art
  titel: string
  kunde: string | null
  /** "14:30" oder null */
  zeit: string | null
  /** Ein kurzer Satz, warum dieser Punkt hier steht. */
  text: string
  ampel: Ampel
  /** Wohin der Klick fuehrt. */
  ziel: string
  clientId?: string | null
  /** Frist dieses Schritts ("YYYY-MM-DD"), fuer die Reihenfolge in Gruppen. */
  frist?: string | null
  /** Nur bei Dreh: haengt das Video schon an einem Drehtag? */
  drehtag?: string | null
  /** Gebuendelt: die einzelnen Videos dahinter (mind. 2). */
  gruppe?: Punkt[]
}

export interface Lage {
  brennt: Punkt[]
  heute: Punkt[]
  vorarbeit: Punkt[]
  /** Nichts Dringendes mehr -- dann darf die Oberflaeche aufatmen. */
  ruhig: boolean
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null)

function kundenName(x: { clients?: { name: string } | null }): string | null {
  return x.clients?.name ?? null
}

const ARTLABEL: Record<Schritt, Art> = {
  dreh: 'dreh', schnitt: 'schnitt', planung: 'planung', posten: 'posten',
}

/** Uhrzeit aus einem Zeitstempel in deutscher Zeit. */
const UHR = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false,
})
export function zeitAus(startsAt?: string | null): string | null {
  if (!startsAt) return null
  const d = new Date(startsAt)
  return isNaN(d.getTime()) ? null : UHR.format(d)
}

function terminPunkt(t: LageTermin): Punkt {
  const dreh = t.kind === 'dreh'
  return {
    key: `e-${t.id}`,
    id: t.id,
    art: dreh ? 'drehtag' : 'termin',
    titel: t.title,
    kunde: kundenName(t),
    zeit: zeitAus(t.starts_at),
    text: dreh
      ? t.planned_videos ? `Drehtag — ${t.planned_videos} ${t.planned_videos === 1 ? 'Video' : 'Videos'} geplant` : 'Drehtag'
      : 'Termin',
    ampel: 'gruen',
    ziel: t.client_id ? `/client/${t.client_id}` : '/kalender',
  }
}

function videoPunkt(v: LageVideo, heuteIso: string, jetztZeit: string): Punkt {
  const f = fristInfo(v, heuteIso, jetztZeit)
  return {
    key: `v-${v.id}`,
    id: v.id,
    art: f.schritt ? ARTLABEL[f.schritt] : 'posten',
    titel: v.title,
    kunde: kundenName(v),
    zeit: hhmm(v.scheduled_time),
    text: f.text,
    ampel: f.ampel,
    ziel: f.schritt === 'posten' ? '/plan' : '/produktion',
    clientId: v.client_id ?? null,
    frist: f.frist,
    drehtag: v.drehtag ?? null,
  }
}

function aufgabePunkt(a: LageAufgabe, heuteIso: string): Punkt {
  const ueberfaellig = !!a.due_date && a.due_date < heuteIso
  return {
    key: `a-${a.id}`,
    id: a.id,
    art: 'aufgabe',
    titel: a.title,
    kunde: a.clients?.name ?? a.leads?.name ?? null,
    zeit: hhmm(a.due_time),
    text: ueberfaellig
      ? `Überfällig seit ${-tageZwischen(heuteIso, a.due_date!)} ${-tageZwischen(heuteIso, a.due_date!) === 1 ? 'Tag' : 'Tagen'}`
      : (a.priority ?? 0) === 3 ? 'Dringend' : 'Aufgabe heute',
    ampel: ueberfaellig || (a.priority ?? 0) === 3 ? 'rot' : 'gruen',
    ziel: '/aufgaben',
  }
}

/** Nach Uhrzeit, Punkte ohne Uhrzeit hinten. */
function nachZeit(p: Punkt[]): Punkt[] {
  return [...p].sort((a, b) => {
    if (a.zeit && b.zeit) return a.zeit.localeCompare(b.zeit)
    if (a.zeit) return -1
    if (b.zeit) return 1
    return 0
  })
}

export interface LageEingang {
  videos: LageVideo[]
  termine: LageTermin[]
  aufgaben: LageAufgabe[]
}

/**
 * @param heuteIso   "YYYY-MM-DD" in deutscher Zeit
 * @param jetztZeit  "HH:MM" in deutscher Zeit
 */
export function tagesLage(e: LageEingang, heuteIso: string, jetztZeit: string): Lage {
  const morgen = datumPlus(heuteIso, 1)
  const brennt: Punkt[] = []
  const heute: Punkt[] = []
  const vorarbeit: Punkt[] = []

  // --- Termine -------------------------------------------------------------
  for (const t of e.termine) {
    if (t.starts_on === heuteIso) heute.push(terminPunkt(t))
  }

  // --- Aufgaben ------------------------------------------------------------
  for (const a of e.aufgaben) {
    if (!a.due_date) continue
    if (a.due_date < heuteIso) brennt.push(aufgabePunkt(a, heuteIso))
    else if (a.due_date === heuteIso) heute.push(aufgabePunkt(a, heuteIso))
  }

  // --- Videos --------------------------------------------------------------
  for (const v of e.videos) {
    const s = stand(v, heuteIso)
    if (s.gepostet) continue
    const f = fristInfo(v, heuteIso, jetztZeit)
    const p = videoPunkt(v, heuteIso, jetztZeit)

    if (f.ampel === 'rot') { brennt.push(p); continue }

    // Heute posten, oder eine Frist, die heute bzw. morgen endet.
    const postetHeute = f.schritt === 'posten' && v.scheduled_date === heuteIso
    // Im Nur-Posten-Modus ist die Frist der Posting-Tag selbst -- dann
    // gehoert nur Heutiges auf Heute, nicht schon Morgiges.
    const fristBaldFaellig = !NUR_POSTEN && f.frist != null && f.frist <= morgen
    if (postetHeute || fristBaldFaellig) { heute.push(p); continue }

    // Alles Weitere ist Vorarbeit: machbar, aber noch nicht noetig.
    // Nur was man WIRKLICH schon anfassen kann -- ohne Posting-Tag oder ohne
    // gedrehtes Material laesst sich nichts vorziehen.
    if (f.ampel === 'ohne-termin') continue
    // Schneiden laesst sich nur vorziehen, wenn schon gedreht ist.
    if ((f.schritt === 'schnitt' && s.gedreht) || f.schritt === 'planung') vorarbeit.push(p)
    else if (f.schritt === 'dreh' && v.drehtag) vorarbeit.push(p)
  }

  // Vorarbeit: das mit der naechsten Frist zuerst -- das entlastet am meisten.
  vorarbeit.sort((a, b) => {
    const r = { schnitt: 0, planung: 1, dreh: 2 } as Record<string, number>
    const d = (r[a.art] ?? 9) - (r[b.art] ?? 9)
    return d !== 0 ? d : a.titel.localeCompare(b.titel)
  })

  return {
    brennt: nachZeit(buendeln(brennt)),
    heute: nachZeit(buendeln(heute)),
    vorarbeit: buendeln(vorarbeit),
    ruhig: brennt.length === 0 && heute.length === 0,
  }
}

// --- Buendeln -------------------------------------------------------------
// Acht ungedrehte Videos bei einem Kunden sind EINE Sache ("Drehtag
// klaeren"), nicht acht. Gleicher Kunde + gleicher Schritt (drehen,
// schneiden, einplanen) wird zu einer Zeile mit Anzahl. Posts bleiben
// einzeln -- jeder hat seine eigene Uhrzeit.

const BUENDELBAR: Art[] = ['dreh', 'schnitt', 'planung']
const VERB: Record<string, string> = { dreh: 'zu drehen', schnitt: 'zu schneiden', planung: 'einzuplanen' }
const AMPELRANG: Record<string, number> = { rot: 0, gelb: 1, gruen: 2 }

const kurzDatum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`

export function buendeln(punkte: Punkt[]): Punkt[] {
  const gruppen = new Map<string, Punkt[]>()
  const aus: (Punkt | string)[] = []
  for (const p of punkte) {
    if (!BUENDELBAR.includes(p.art) || !p.kunde) { aus.push(p); continue }
    const k = `${p.art}|${p.clientId ?? p.kunde}`
    if (!gruppen.has(k)) { gruppen.set(k, []); aus.push(k) }
    gruppen.get(k)!.push(p)
  }
  return aus.map((x) => {
    if (typeof x !== 'string') return x
    const g = gruppen.get(x)!
    if (g.length === 1) return g[0]
    const sortiert = [...g].sort((a, b) =>
      (AMPELRANG[a.ampel] ?? 3) - (AMPELRANG[b.ampel] ?? 3)
      || (a.frist ?? '9999').localeCompare(b.frist ?? '9999'))
    const erste = sortiert[0]
    const ohne = g.filter((p) => !p.drehtag).length
    const drehtage = [...new Set(g.map((p) => p.drehtag).filter(Boolean))] as string[]
    let text = erste.text
    if (erste.art === 'dreh' && ohne === 0 && drehtage.length === 1) text = `Drehtag am ${kurzDatum(drehtage[0])}`
    else if (erste.art === 'dreh' && ohne > 0 && ohne < g.length) text = `${erste.text} · ${ohne} ohne Drehtag`
    return {
      ...erste,
      key: `g-${x}`,
      titel: `${erste.kunde}: ${g.length} Videos noch ${VERB[erste.art]}`,
      zeit: null,
      text,
      drehtag: ohne === 0 ? drehtage[0] ?? null : null,
      gruppe: sortiert,
    }
  })
}

/** Wie viele einzelne Sachen stecken in den Punkten? */
export function anzahl(p: Punkt[]): number {
  return p.reduce((n, x) => n + (x.gruppe?.length ?? 1), 0)
}

/** Kurzfassung fuer die Zeile unter der Begruessung. */
export function lageSatz(l: Lage): string {
  if (l.brennt.length > 0) {
    const n = anzahl(l.brennt)
    return n === 1 ? '1 Sache brennt' : `${n} Sachen brennen`
  }
  if (l.heute.length > 0) {
    const n = anzahl(l.heute)
    return `${n} ${n === 1 ? 'Punkt' : 'Punkte'} für heute`
  }
  if (l.vorarbeit.length > 0) return 'Heute nichts Dringendes — Zeit zum Vorarbeiten'
  return 'Alles sauber. Nichts offen.'
}

/**
 * Namen zu "Kebab Kumpels 5 · Hajo 4 +2 weitere" -- die meisten zuerst.
 * Gleiche Regel wie proKunde() im Morgen-Push (daily-reminders/brennt.ts).
 */
export function proKundeSatz(namen: (string | null | undefined)[], max = 3): string {
  const zahl = new Map<string, number>()
  for (const n of namen) {
    const k = (n ?? '').trim() || 'Ohne Kunde'
    zahl.set(k, (zahl.get(k) ?? 0) + 1)
  }
  const reihe = [...zahl.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const rest = reihe.length - max
  return reihe.slice(0, max).map(([k, n]) => `${k} ${n}`).join(' · ') + (rest > 0 ? ` +${rest} weitere` : '')
}

/** Nach Kunde gruppiert, groesste Gruppe zuerst; Reihenfolge innerhalb bleibt. */
export function nachKunde<T>(liste: T[], name: (x: T) => string | null | undefined): { kunde: string; eintraege: T[] }[] {
  const m = new Map<string, T[]>()
  for (const x of liste) {
    const k = (name(x) ?? '').trim() || 'Ohne Kunde'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(x)
  }
  return [...m.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([kunde, eintraege]) => ({ kunde, eintraege }))
}
