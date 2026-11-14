// Abgleich: was ist bei TikTok/Instagram gepostet, aber noch nicht im CRM?
// ---------------------------------------------------------------------------
// Fassie, 14.11.2026: "Pack einfach alle neuesten Videos ins CRM. Im
// schlimmsten Fall ist eins zu viel drin (Kunde hat selbst gepostet) -- das
// lösche ich dann." Dann muss niemand mehr auf "Gepostet" tippen.
//
// Reine Planung ohne Datenbank (testbar). Für jedes neue Posting, in dieser
// Reihenfolge:
//   1. Hängt sein Zwilling (andere Plattform) schon an einem Video im CRM,
//      dem genau dieser Link fehlt?  -> dort ergänzen
//   2. Sonst TikTok + Instagram desselben Videos zusammenlegen (gepostet
//      innerhalb von 36 Stunden, nächstgelegene zuerst)
//   3. Die Gruppe füllt den frühesten offenen Platzhalter ("November 8") des
//      Monats -- sonst ein neues Video.
// Gelöschte Videos zählen als "schon da": Was Fassie rauslöscht, kommt beim
// nächsten Lauf nicht wieder.

export type Plattform = 'tiktok' | 'instagram'

export interface NeuesPosting {
  platform: Plattform
  url: string
  zeit: string // ISO
  channel_id: string | null
}

export interface OffenesVideo {
  id: string
  posted_at: string | null
  channel_id: string | null
  hatTiktok: boolean
  hatInstagram: boolean
}

export interface Platzhalter {
  id: string
  scheduled_date: string // YYYY-MM-DD
  channel_id: string | null
}

export type Aktion =
  | { art: 'ergaenzen'; videoId: string; posting: NeuesPosting }
  | { art: 'platzhalter'; videoId: string; postings: NeuesPosting[] }
  | { art: 'neu'; postings: NeuesPosting[] }

const MAX_ABSTAND_MS = 36 * 3600_000

function passtKanal(a: string | null, b: string | null): boolean {
  return !a || !b || a === b
}

function abstand(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b))
}

export function berlinDatum(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

export function planeAbgleich(opts: {
  neue: NeuesPosting[]
  offene: OffenesVideo[]
  platzhalter: Platzhalter[]
}): Aktion[] {
  const aktionen: Aktion[] = []
  const offene = opts.offene.map((o) => ({ ...o }))
  const rest: NeuesPosting[] = []

  // 1. An vorhandene Videos ergänzen, denen genau dieser Link fehlt
  for (const p of [...opts.neue].sort((a, b) => a.zeit.localeCompare(b.zeit))) {
    const kandidaten = offene
      .filter((o) => o.posted_at && passtKanal(o.channel_id, p.channel_id)
        && (p.platform === 'tiktok' ? !o.hatTiktok : !o.hatInstagram)
        && abstand(o.posted_at, p.zeit) <= MAX_ABSTAND_MS)
      .sort((a, b) => abstand(a.posted_at!, p.zeit) - abstand(b.posted_at!, p.zeit))
    const ziel = kandidaten[0]
    if (ziel) {
      if (p.platform === 'tiktok') ziel.hatTiktok = true
      else ziel.hatInstagram = true
      aktionen.push({ art: 'ergaenzen', videoId: ziel.id, posting: p })
    } else {
      rest.push(p)
    }
  }

  // 2. TikTok + Instagram desselben Videos zusammenlegen (engste Paare zuerst)
  const tt = rest.filter((p) => p.platform === 'tiktok')
  const ig = rest.filter((p) => p.platform === 'instagram')
  const paare: { t: NeuesPosting; i: NeuesPosting; d: number }[] = []
  for (const t of tt) for (const i of ig) {
    if (!passtKanal(t.channel_id, i.channel_id)) continue
    const d = abstand(t.zeit, i.zeit)
    if (d <= MAX_ABSTAND_MS) paare.push({ t, i, d })
  }
  paare.sort((a, b) => a.d - b.d)
  const benutzt = new Set<NeuesPosting>()
  const gruppen: NeuesPosting[][] = []
  for (const { t, i } of paare) {
    if (benutzt.has(t) || benutzt.has(i)) continue
    benutzt.add(t); benutzt.add(i)
    gruppen.push([t, i])
  }
  for (const p of rest) if (!benutzt.has(p)) gruppen.push([p])

  // 3. Platzhalter füllen, früheste Gruppe nimmt den frühesten Platzhalter
  const frei = [...opts.platzhalter].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  const start = (g: NeuesPosting[]) => g.map((p) => p.zeit).sort()[0]
  gruppen.sort((a, b) => start(a).localeCompare(start(b)))
  for (const g of gruppen) {
    const monat = berlinDatum(start(g)).slice(0, 7)
    const kanal = g.find((p) => p.channel_id)?.channel_id ?? null
    const idx = frei.findIndex((f) => f.scheduled_date.startsWith(monat) && passtKanal(f.channel_id, kanal))
    if (idx >= 0) {
      const [f] = frei.splice(idx, 1)
      aktionen.push({ art: 'platzhalter', videoId: f.id, postings: g })
    } else {
      aktionen.push({ art: 'neu', postings: g })
    }
  }
  return aktionen
}

/** Adressen vergleichbar machen: ohne ?-Teil, ohne Schrägstrich am Ende, klein. */
export function normUrl(u: string): string {
  return u.split('?')[0].replace(/\/+$/, '').toLowerCase()
}

/** Platzhalter-Titel wie "November 8" (siehe src/lib/autoplan.ts). */
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export function istPlatzhalterTitel(t: string | null | undefined): boolean {
  return new RegExp(`^(${MONATE.join('|')})\\s+\\d+$`).test((t ?? '').trim())
}
