// Reichweite: Bis wann ist ein Kunde sicher -- grün, gelb, rot.
// ---------------------------------------------------------------------------
// Fassies Bild (14.11.2026): Heute ist der 14. Bis zum 14. ist alles grün,
// weil on time gepostet wurde. Bis zum 18. ist es auch grün, weil die
// nächsten Videos schon bei Metricool eingeplant sind -- würden wir
// verschwinden, ginge es trotzdem raus. Bis zum 22. gelb, weil die Videos
// zwar da sind, aber noch beim Schneiden. Danach rot: nicht mal angelegt
// oder nicht gedreht.
//
// So wird gerechnet:
//   1. Das Monatsziel (Retainer bzw. Monats-Ausnahme) wird wie im Monatsplan
//      gleichmäßig auf den Monat verteilt -> "Termine".
//   2. Vergangene Termine deckt nur, was wirklich gepostet ist. Was fehlt,
//      ist ein verpasster Termin (rot).
//   3. Kommende Termine (ab heute) füllen der Reihe nach:
//      Vorsprung (mehr gepostet als bisher fällig)  -> grün
//      eingeplant (status 'planned' = bei Metricool) -> grün
//      in Arbeit (gedreht, Rohschnitt, Schnitt, fertig) -> gelb
//      alles andere                                    -> rot
//   4. Jeder Tag bekommt die Farbe des nächsten Termins an oder nach ihm.
//
// Die Agentur ist das Schlechteste aller Kunden an jedem Tag: Ist bei allen
// bis zum 25. grün, ist die Agentur bis zum 25. grün.
//
// Reine Rechenlogik ohne Datenbank -- testbar.

import { gleichmaessigeTermine, vorschlagAbstand, tageImMonat } from './monatsrhythmus'

export type Farbe = 'gruen' | 'gelb' | 'rot'

export interface RVideo {
  status: string
  scheduled_date: string | null
  posted_at: string | null
  prep_shot?: boolean | null
  prep_edited?: boolean | null
  prep_scheduled?: boolean | null
  produktion_stufe?: string | null
}

export interface Termin {
  datum: string
  farbe: Farbe
  /** Termin liegt vor heute und ist nicht gepostet. */
  verpasst: boolean
}

export interface Reichweite {
  monat: string
  heute: string
  ziel: number
  gepostet: number
  eingeplant: number
  inArbeit: number
  /** Termine ab heute, für die es nicht mal ein gedrehtes Video gibt. */
  fehlen: number
  termine: Termin[]
  /** Farbe je Tag, Index 0 = 1. des Monats. null = kein Ziel. */
  tage: (Farbe | null)[]
  /** Letzter Tag ab heute, der durchgehend grün ist. null = heute schon nicht. */
  gruenBis: string | null
  /** Letzter Tag ab heute, der höchstens gelb ist. */
  gelbBis: string | null
}

const STUFEN_IN_ARBEIT = new Set(['roh', 'pruefung', 'feinschliff', 'fertig'])

export function istEingeplant(v: RVideo): boolean {
  return v.status === 'planned'
}

export function istInArbeit(v: RVideo): boolean {
  if (v.status === 'posted' || istEingeplant(v)) return false
  return v.status === 'ready' || !!v.prep_shot || !!v.prep_edited
    || (!!v.produktion_stufe && STUFEN_IN_ARBEIT.has(v.produktion_stufe))
}

/** Wann ging es raus -- posted_at, sonst der geplante Tag. */
export function postTag(v: RVideo): string | null {
  return (v.posted_at ?? v.scheduled_date ?? '').slice(0, 10) || null
}

function iso(monat: string, tag: number): string {
  return `${monat}-${String(tag).padStart(2, '0')}`
}

/** Monatsziel gleichmäßig verteilt, wie im Monatsplan. */
export function zielTermine(monat: string, ziel: number): string[] {
  if (ziel <= 0) return []
  return gleichmaessigeTermine({ monatsKey: monat, anzahl: ziel, startTag: 1, abstand: vorschlagAbstand(monat, ziel, 1) })
}

export function reichweite(opts: {
  monat: string
  heute: string
  ziel: number
  videos: RVideo[]
  /** Ohne Vertrag (Ehrenamt/Referenz): höchstens gelb, nie rot. */
  mitVertrag?: boolean
}): Reichweite {
  const { monat, heute, ziel, videos } = opts
  const mitVertrag = opts.mitVertrag ?? true
  const tageAnzahl = tageImMonat(monat)
  const lebend = videos.filter((v) => v.status !== 'deleted')

  const gepostet = lebend.filter((v) => v.status === 'posted' && postTag(v)?.startsWith(monat)).length
  const eingeplant = lebend.filter((v) => istEingeplant(v) && (!v.scheduled_date || v.scheduled_date >= heute)).length
  const inArbeit = lebend.filter(istInArbeit).length

  const daten = zielTermine(monat, ziel)
  const rot: Farbe = mitVertrag ? 'rot' : 'gelb'
  const termine: Termin[] = []
  const vergangen = daten.filter((d) => d < heute)
  const kommend = daten.filter((d) => d >= heute)

  // Vergangene Termine: nur Gepostetes zählt.
  vergangen.forEach((d, i) => {
    const ok = i < gepostet
    termine.push({ datum: d, farbe: ok ? 'gruen' : rot, verpasst: !ok })
  })
  // Kommende Termine der Reihe nach füllen.
  let vorsprung = Math.max(0, gepostet - vergangen.length)
  let gruen = eingeplant
  let gelb = inArbeit
  let fehlen = 0
  for (const d of kommend) {
    let farbe: Farbe
    if (vorsprung > 0) { vorsprung--; farbe = 'gruen' }
    else if (gruen > 0) { gruen--; farbe = 'gruen' }
    else if (gelb > 0) { gelb--; farbe = 'gelb' }
    else { fehlen++; farbe = rot }
    termine.push({ datum: d, farbe, verpasst: false })
  }

  // Tage einfärben: Farbe des nächsten Termins an oder nach dem Tag.
  const tage: (Farbe | null)[] = []
  for (let t = 1; t <= tageAnzahl; t++) {
    if (termine.length === 0) { tage.push(null); continue }
    const d = iso(monat, t)
    const naechster = termine.find((x) => x.datum >= d) ?? termine[termine.length - 1]
    tage.push(naechster.farbe)
  }

  // Durchgehende Strecken ab heute.
  let gruenBis: string | null = null
  let gelbBis: string | null = null
  const heuteTag = heute.startsWith(monat) ? Number(heute.slice(8, 10)) : heute < iso(monat, 1) ? 1 : tageAnzahl + 1
  if (termine.length) {
    let gruenAus = false
    for (let t = heuteTag; t <= tageAnzahl; t++) {
      const f = tage[t - 1]
      if (!gruenAus && f === 'gruen') gruenBis = iso(monat, t)
      else gruenAus = true
      if (f === 'gruen' || f === 'gelb') gelbBis = iso(monat, t)
      else break
    }
  }

  return { monat, heute, ziel, gepostet, eingeplant, inArbeit, fehlen, termine, tage, gruenBis, gelbBis }
}

const RANG: Record<Farbe, number> = { gruen: 0, gelb: 1, rot: 2 }

/** Agentur-Faden: je Tag die schlechteste Farbe aller Kunden mit Ziel. */
export function agenturFaden(liste: Reichweite[], monat: string, heute: string): Reichweite {
  const mit = liste.filter((r) => r.ziel > 0)
  const tageAnzahl = tageImMonat(monat)
  const tage: (Farbe | null)[] = []
  for (let i = 0; i < tageAnzahl; i++) {
    let schlimmste: Farbe | null = null
    for (const r of mit) {
      const f = r.tage[i]
      if (f && (schlimmste == null || RANG[f] > RANG[schlimmste])) schlimmste = f
    }
    tage.push(schlimmste)
  }
  let gruenBis: string | null = null
  let gelbBis: string | null = null
  const heuteTag = heute.startsWith(monat) ? Number(heute.slice(8, 10)) : 1
  let gruenAus = false
  for (let t = heuteTag; t <= tageAnzahl; t++) {
    const f = tage[t - 1]
    if (f == null) break
    if (!gruenAus && f === 'gruen') gruenBis = iso(monat, t)
    else gruenAus = true
    if (f === 'gruen' || f === 'gelb') gelbBis = iso(monat, t)
    else break
  }
  const summe = (k: 'ziel' | 'gepostet' | 'eingeplant' | 'inArbeit' | 'fehlen') => mit.reduce((s, r) => s + r[k], 0)
  return {
    monat, heute, ziel: summe('ziel'), gepostet: summe('gepostet'), eingeplant: summe('eingeplant'),
    inArbeit: summe('inArbeit'), fehlen: summe('fehlen'), termine: [], tage, gruenBis, gelbBis,
  }
}

const kurz = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.`

/** Ein Satz für unter den Balken. */
export function reichweiteSatz(r: Reichweite): string {
  if (r.ziel <= 0) return 'Kein Monatsziel'
  const ende = iso(r.monat, tageImMonat(r.monat))
  if (r.gruenBis === ende) return 'Ganzer Monat grün – alles gepostet oder eingeplant'
  const teile: string[] = []
  if (r.gruenBis) teile.push(`Grün bis ${kurz(r.gruenBis)}`)
  else teile.push('Heute schon nicht grün')
  if (r.gelbBis && r.gelbBis !== r.gruenBis) teile.push(`gelb bis ${kurz(r.gelbBis)}`)
  if (r.fehlen > 0) teile.push(`${r.fehlen} ${r.fehlen === 1 ? 'Video fehlt' : 'Videos fehlen'} komplett`)
  const verpasst = r.termine.filter((t) => t.verpasst).length
  if (verpasst > 0) teile.push(`${verpasst} verpasst`)
  return teile.join(' · ')
}

export { kurz as kurzDatumR }
