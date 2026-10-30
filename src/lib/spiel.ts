// Das Spiel: die Agentur als Stadt, die waechst.
// ---------------------------------------------------------------------------
// Fassie (30.10.2026): "Wir sind beide die CEOs. Wir wollen gemeinsam aufs
// naechste Level -- kein Gegeneinander." Darum gibt es hier EIN Konto fuer
// die Agentur, keine Spieler.
//
// Alles, was Punkte bringt, ist echte Arbeit mit echten Zahlen aus dem CRM:
// gepostete Videos, Views, abgeschlossene Monate, bezahlte Rechnungen,
// gewonnene Kunden, erledigte Meilensteine. Nichts fuer Klicks.
//
// Die Regeln stehen in XP; die Level in LEVEL; alles Weitere rechnet
// spielStand() aus den rohen Zeilen. Reine Logik -- keine Datenbank.

export const XP = {
  video: 50,                // ein gepostetes Kundenvideo
  eigenesVideo: 80,         // Personal Brand zaehlt mehr: das ist der Hebel
  je10kViews: 25,           // je angefangene 10.000 Views
  viewsDeckelJeVideo: 500,  // ... hoechstens so viel je Video
  hit: 150,                 // Video >= 2x so gut wie der typische Post des Kunden
  monatGruen: 300,          // Kontrollstempel steht auf dem Monatsende
  rechnungBezahlt: 200,     // Monat eines Kunden bezahlt
  je100Euro: 10,            // ... und je 100 EUR, die bezahlt wurden (Umsatz zaehlt)
  neuerKunde: 1000,         // zahlender Kunde mit erstem geposteten Video
  streakWoche: 100,         // je volle Woche Posting-Streak (aktuell)
} as const

/** Umsatz-Meilensteine je Monat (gestellt), EUR. */
export const MEILENSTEINE = [2_500, 5_000, 7_500, 10_000, 15_000, 20_000, 30_000, 50_000, 100_000]

export interface Level { nr: number; name: string; ab: number; satz: string; schaltetFrei: string | null }

export const LEVEL: Level[] = [
  { nr: 0, name: 'Garage', ab: 0, satz: 'Zwei Leute, ein Handy, eine Idee.', schaltetFrei: null },
  { nr: 1, name: 'Studio', ab: 3_000, satz: 'Die ersten Kunden zahlen. Es wird ernst.', schaltetFrei: 'Personal Brand' },
  { nr: 2, name: 'Agentur', ab: 8_000, satz: 'Ihr habt einen Namen in Münster.', schaltetFrei: 'Empfehlungsprogramm' },
  { nr: 3, name: 'Boutique', ab: 16_000, satz: 'Kunden kommen zu euch, nicht umgekehrt.', schaltetFrei: 'Büro suchen' },
  { nr: 4, name: 'Haus', ab: 32_000, satz: 'Zu zweit reicht es nicht mehr.', schaltetFrei: 'Erster Mitarbeiter' },
  { nr: 5, name: 'Powerhouse', ab: 64_000, satz: 'Die Agentur, über die man redet.', schaltetFrei: 'Ads-Budget' },
  { nr: 6, name: 'Imperium', ab: 128_000, satz: 'Dreißig Kunden. Das Ziel.', schaltetFrei: null },
]

export interface SVideo {
  id: string
  client_id: string
  title: string | null
  posted_at: string | null
  views: number | null
  /** Posting-Tag (fuer Kalender/Streak, wenn posted_at fehlt) */
  scheduled_date?: string | null
}

export interface SKunde {
  id: string
  name: string
  client_type: string | null
  monthly_fee: number | string | null
  monthly_quota: number | null
  active: boolean
  pausiert_seit: string | null
  logo_url: string | null
  brand_color: string | null
}

export interface SKontrolle { client_id: string; month_key: string; geprueft_bis: string }
export interface SPlan {
  client_id: string
  month_key: string
  zahlstatus: string | null
  betrag: number | string | null
  quota: number | null
  /** geplant | unsicher | fest | abgeschlossen */
  status?: string | null
  /** false = in diesem Monat bewusst nicht dabei */
  dabei?: boolean | null
}

export interface UmsatzKunde { id: string; name: string; betrag: number; zahlstatus: string; geschaetzt: boolean }

export interface UmsatzStand {
  monat: string
  /** Was diesen Monat in Rechnung geht (Monatsplan; ohne Plan: Honorar des aktiven Kunden) */
  gestellt: number
  bezahlt: number
  offen: number
  proKunde: UmsatzKunde[]
  vormonat: { gestellt: number; bezahlt: number }
  /** Alles, was je bezahlt wurde */
  gesamtBezahlt: number
  bester: { key: string; betrag: number } | null
  naechster: number | null
  /** 0..1 dieses Monats bis zum naechsten Meilenstein */
  fortschritt: number
  erreicht: number[]
}
export interface SQuest {
  id: string
  titel: string
  beschreibung: string | null
  xp: number
  art: 'meilenstein' | 'aufgabe'
  status: 'offen' | 'erledigt'
  faellig: string | null
  ab_level: number
  sort: number
  erledigt_am: string | null
}

export interface SpielEingang {
  kunden: SKunde[]
  videos: SVideo[]
  kontrollen: SKontrolle[]
  plaene: SPlan[]
  quests: SQuest[]
  heute: string
}

export interface XpPosten { key: string; label: string; anzahl: number; xp: number }

export interface Monatsbilanz {
  key: string
  videos: number
  views: number
  umsatz: number
  gruen: number
  xp: number
  rekordViews: boolean
  rekordVideos: boolean
}

export interface SpielStand {
  xp: number
  level: Level
  naechstes: Level | null
  /** 0..1 bis zum naechsten Level */
  fortschritt: number
  posten: XpPosten[]
  streak: number
  streakBeste: number
  /** Heute schon gepostet? */
  heuteGepostet: boolean
  hits: { video: SVideo; faktor: number }[]
  monate: Monatsbilanz[]
  /** Quests, die auf diesem Level sichtbar sind (offen zuerst) */
  quests: (SQuest & { gesperrt: boolean })[]
  rekorde: { label: string; wert: string; wann: string }[]
  umsatz: UmsatzStand
}

/** Umsatz: Monatsplaene sind die Wahrheit; fehlt ein Plan, zaehlt das Honorar des aktiven Kunden als Schaetzung. */
export function umsatzStand(kunden: SKunde[], plaene: SPlan[], heute: string): UmsatzStand {
  const monat = heute.slice(0, 7)
  const vm = (() => { const d = new Date(heute + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) })()
  const kundeVon = new Map(kunden.map((k) => [k.id, k]))

  const fuerMonat = (key: string): UmsatzKunde[] => {
    const aus: UmsatzKunde[] = []
    const gesehen = new Set<string>()
    for (const p of plaene) {
      if (p.month_key !== key || !p.client_id) continue
      gesehen.add(p.client_id)
      if (p.dabei === false) continue
      const betrag = n(p.betrag)
      if (betrag <= 0) continue
      aus.push({ id: p.client_id, name: kundeVon.get(p.client_id)?.name ?? '—', betrag, zahlstatus: p.zahlstatus ?? 'offen', geschaetzt: false })
    }
    // nur fuer den laufenden Monat schaetzen -- fruehere Monate ohne Plan waren wohl ohne Rechnung
    if (key === monat) {
      for (const k of kunden) {
        if (gesehen.has(k.id) || !k.active || k.client_type !== 'zahlend' || k.pausiert_seit) continue
        const fee = n(k.monthly_fee)
        if (fee > 0) aus.push({ id: k.id, name: k.name, betrag: fee, zahlstatus: 'offen', geschaetzt: true })
      }
    }
    return aus.sort((a, b) => b.betrag - a.betrag)
  }

  const dieser = fuerMonat(monat)
  const gestellt = dieser.reduce((s, k) => s + k.betrag, 0)
  const bezahlt = dieser.filter((k) => k.zahlstatus === 'bezahlt').reduce((s, k) => s + k.betrag, 0)
  const vorher = fuerMonat(vm)

  const jeMonat = new Map<string, number>()
  let gesamtBezahlt = 0
  for (const p of plaene) {
    if (p.dabei === false || !p.client_id) continue
    const b = n(p.betrag)
    if (b <= 0) continue
    jeMonat.set(p.month_key, (jeMonat.get(p.month_key) ?? 0) + b)
    if (p.zahlstatus === 'bezahlt') gesamtBezahlt += b
  }
  jeMonat.set(monat, Math.max(jeMonat.get(monat) ?? 0, gestellt))
  let bester: UmsatzStand['bester'] = null
  for (const [key, betrag] of jeMonat) if (!bester || betrag > bester.betrag) bester = { key, betrag }

  const hoechster = Math.max(0, ...jeMonat.values())
  const erreicht = MEILENSTEINE.filter((m) => hoechster >= m)
  const naechster = MEILENSTEINE.find((m) => m > gestellt) ?? null
  const vorheriger = [...MEILENSTEINE].reverse().find((m) => m <= gestellt) ?? 0
  const fortschritt = naechster ? Math.min(1, (gestellt - vorheriger) / (naechster - vorheriger)) : 1

  return {
    monat, gestellt, bezahlt, offen: gestellt - bezahlt, proKunde: dieser,
    vormonat: { gestellt: vorher.reduce((s, k) => s + k.betrag, 0), bezahlt: vorher.filter((k) => k.zahlstatus === 'bezahlt').reduce((s, k) => s + k.betrag, 0) },
    gesamtBezahlt, bester, naechster, fortschritt, erreicht,
  }
}

// ----------------------------------------------------------- Das Studio
// Jedes Moebelstueck ist ein Knopf ins CRM. Was dasteht, haengt vom Level ab:
// gesperrte Stuecke stehen als Umriss im Raum, bis das Level erreicht ist.

export type StudioZiel = { art: 'crm'; pfad: string } | { art: 'reiter'; reiter: 'quests' | 'bilanz' }

export interface Ausstattung {
  key: string
  name: string
  /** Was man damit im CRM macht -- ein Satz */
  tut: string
  abLevel: number
  ziel: StudioZiel
}

export const AUSSTATTUNG: Ausstattung[] = [
  { key: 'schreibtisch', name: 'Schreibtisch', tut: 'Der Pilot: was heute ansteht, bevor es brennt.', abLevel: 0, ziel: { art: 'crm', pfad: '/pilot' } },
  { key: 'ofen', name: 'Backstube', tut: 'Was gerade geschnitten wird — und was fertig zum Posten ist.', abLevel: 0, ziel: { art: 'crm', pfad: '/ofen' } },
  { key: 'kalender', name: 'Posting-Plan', tut: 'Welches Video wann rausgeht.', abLevel: 0, ziel: { art: 'crm', pfad: '/plan' } },
  { key: 'pinnwand', name: 'Pinnwand', tut: 'Quests und Meilensteine der Agentur.', abLevel: 0, ziel: { art: 'reiter', reiter: 'quests' } },
  { key: 'kundenwand', name: 'Kundenwand', tut: 'Alle Kunden, alle Akten.', abLevel: 1, ziel: { art: 'crm', pfad: '/kunden' } },
  { key: 'aktenschrank', name: 'Aktenschrank', tut: 'Dokumente der Agentur: Gewerbeanmeldung, Verträge, Scans.', abLevel: 1, ziel: { art: 'crm', pfad: '/dokumente' } },
  { key: 'pflanze', name: 'Monstera', tut: 'Steht einfach da. Wächst mit.', abLevel: 1, ziel: { art: 'crm', pfad: '/' } },
  { key: 'kasse', name: 'Kasse', tut: 'Umsatz: gestellt, bezahlt, offen — und die Monate.', abLevel: 2, ziel: { art: 'reiter', reiter: 'bilanz' } },
  { key: 'kaffee', name: 'Kaffeemaschine', tut: 'Der Kalender: Termine, Drehtage, Deadlines.', abLevel: 2, ziel: { art: 'crm', pfad: '/kalender' } },
  { key: 'neon', name: 'Neon-Schild', tut: 'Die Personal Brand: eure eigenen Videos.', abLevel: 3, ziel: { art: 'crm', pfad: '/brand' } },
  { key: 'pokale', name: 'Pokalregal', tut: 'Hits und Rekorde — Videos, die 2× besser liefen als sonst.', abLevel: 3, ziel: { art: 'reiter', reiter: 'bilanz' } },
  { key: 'sofa', name: 'Lounge', tut: 'Das Team.', abLevel: 4, ziel: { art: 'crm', pfad: '/team' } },
  { key: 'tisch2', name: 'Zweiter Schreibtisch', tut: 'Für den ersten Mitarbeiter.', abLevel: 4, ziel: { art: 'crm', pfad: '/team' } },
  { key: 'konferenz', name: 'Konferenztisch', tut: 'Firma: Verträge, Zahlen, Einstellungen.', abLevel: 5, ziel: { art: 'crm', pfad: '/firma' } },
]

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0

export function tagVon(iso: string | null | undefined): string | null {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch { return null }
}

export function datumPlus(iso: string, tage: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

export function monatsEnde(key: string): string {
  const j = Number(key.slice(0, 4)), m = Number(key.slice(5, 7))
  return `${key}-${String(new Date(Date.UTC(j, m, 0)).getUTCDate()).padStart(2, '0')}`
}

function median(w: number[]): number | null {
  const s = [...w].sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function levelFuer(xp: number): { level: Level; naechstes: Level | null; fortschritt: number } {
  let level = LEVEL[0]
  for (const l of LEVEL) if (xp >= l.ab) level = l
  const naechstes = LEVEL.find((l) => l.nr === level.nr + 1) ?? null
  const fortschritt = naechstes ? Math.min(1, (xp - level.ab) / (naechstes.ab - level.ab)) : 1
  return { level, naechstes, fortschritt }
}

/** Views-XP eines Videos: je angefangene 10k, gedeckelt. */
export function viewsXp(views: number | null): number {
  if (!views || views <= 0) return 0
  return Math.min(XP.viewsDeckelJeVideo, Math.ceil(views / 10_000) * XP.je10kViews)
}

/** Posting-Streak: Tage in Folge mit mindestens einem Post, bis heute (oder gestern). */
export function streakVon(tage: Set<string>, heute: string): { aktuell: number; beste: number; heute: boolean } {
  const heuteGepostet = tage.has(heute)
  let aktuell = 0
  let t = heuteGepostet ? heute : datumPlus(heute, -1)
  while (tage.has(t)) { aktuell++; t = datumPlus(t, -1) }
  // beste Serie ueberhaupt
  let beste = 0
  const sortiert = [...tage].sort()
  let lauf = 0, vorher: string | null = null
  for (const d of sortiert) {
    lauf = vorher && datumPlus(vorher, 1) === d ? lauf + 1 : 1
    beste = Math.max(beste, lauf)
    vorher = d
  }
  return { aktuell, beste: Math.max(beste, aktuell), heute: heuteGepostet }
}

export function spielStand(e: SpielEingang): SpielStand {
  const kundeVon = new Map(e.kunden.map((k) => [k.id, k]))
  const gepostet = e.videos.filter((v) => v.posted_at)
  const posten: XpPosten[] = []

  // --- Videos ----------------------------------------------------------------
  const eigene = gepostet.filter((v) => kundeVon.get(v.client_id)?.client_type === 'eigen')
  const kundenVideos = gepostet.length - eigene.length
  posten.push({ key: 'videos', label: 'Kundenvideos gepostet', anzahl: kundenVideos, xp: kundenVideos * XP.video })
  posten.push({ key: 'eigene', label: 'Eigene Videos (Personal Brand)', anzahl: eigene.length, xp: eigene.length * XP.eigenesVideo })

  // --- Views ---------------------------------------------------------------------
  const viewsXpSumme = gepostet.reduce((s, v) => s + viewsXp(v.views), 0)
  const viewsGesamt = gepostet.reduce((s, v) => s + n(v.views), 0)
  posten.push({ key: 'views', label: 'Views', anzahl: viewsGesamt, xp: viewsXpSumme })

  // --- Hits: >= 2x Median des Kunden ------------------------------------------
  const proKunde = new Map<string, number[]>()
  for (const v of gepostet) if (v.views != null) proKunde.set(v.client_id, [...(proKunde.get(v.client_id) ?? []), n(v.views)])
  const hits: { video: SVideo; faktor: number }[] = []
  for (const v of gepostet) {
    const l = proKunde.get(v.client_id) ?? []
    if (l.length < 5 || v.views == null) continue
    const m = median(l)
    if (m && n(v.views) / m >= 2) hits.push({ video: v, faktor: n(v.views) / m })
  }
  hits.sort((a, b) => b.faktor - a.faktor)
  posten.push({ key: 'hits', label: 'Hits (2× besser als sonst)', anzahl: hits.length, xp: hits.length * XP.hit })

  // --- Monate gruen ----------------------------------------------------------
  const gruene = e.kontrollen.filter((k) => k.geprueft_bis >= monatsEnde(k.month_key))
  posten.push({ key: 'gruen', label: 'Monate abgeschlossen', anzahl: gruene.length, xp: gruene.length * XP.monatGruen })

  // --- Rechnungen bezahlt ----------------------------------------------------
  const bezahlt = e.plaene.filter((p) => p.zahlstatus === 'bezahlt' && p.dabei !== false)
  posten.push({ key: 'bezahlt', label: 'Rechnungen bezahlt', anzahl: bezahlt.length, xp: bezahlt.length * XP.rechnungBezahlt })
  const umsatz = umsatzStand(e.kunden, e.plaene, e.heute)
  posten.push({ key: 'umsatz', label: 'Umsatz bezahlt (je 100 €)', anzahl: Math.round(umsatz.gesamtBezahlt), xp: Math.floor(umsatz.gesamtBezahlt / 100) * XP.je100Euro })

  // --- Kunden: zahlend mit mindestens einem Post ----------------------------
  const zahlend = e.kunden.filter((k) => k.client_type === 'zahlend' && gepostet.some((v) => v.client_id === k.id))
  posten.push({ key: 'kunden', label: 'Zahlende Kunden gewonnen', anzahl: zahlend.length, xp: zahlend.length * XP.neuerKunde })

  // --- Quests ----------------------------------------------------------------
  const erledigt = e.quests.filter((q) => q.status === 'erledigt')
  posten.push({ key: 'quests', label: 'Meilensteine & Aufgaben', anzahl: erledigt.length, xp: erledigt.reduce((s, q) => s + n(q.xp), 0) })

  // --- Streak ----------------------------------------------------------------
  const tage = new Set(gepostet.map((v) => tagVon(v.posted_at)).filter(Boolean) as string[])
  const st = streakVon(tage, e.heute)
  const streakXp = Math.floor(st.aktuell / 7) * XP.streakWoche
  posten.push({ key: 'streak', label: 'Posting-Streak (je volle Woche)', anzahl: st.aktuell, xp: streakXp })

  const xp = posten.reduce((s, p) => s + p.xp, 0)
  const { level, naechstes, fortschritt } = levelFuer(xp)

  // --- Monatsbilanzen -------------------------------------------------------
  const monatMap = new Map<string, Monatsbilanz>()
  const bilanz = (key: string) => {
    if (!monatMap.has(key)) monatMap.set(key, { key, videos: 0, views: 0, umsatz: 0, gruen: 0, xp: 0, rekordViews: false, rekordVideos: false })
    return monatMap.get(key)!
  }
  for (const v of gepostet) {
    const key = tagVon(v.posted_at)!.slice(0, 7)
    const b = bilanz(key)
    b.videos++
    b.views += n(v.views)
    b.xp += (kundeVon.get(v.client_id)?.client_type === 'eigen' ? XP.eigenesVideo : XP.video) + viewsXp(v.views)
  }
  for (const h of hits) bilanz(tagVon(h.video.posted_at)!.slice(0, 7)).xp += XP.hit
  for (const k of gruene) { const b = bilanz(k.month_key); b.gruen++; b.xp += XP.monatGruen }
  for (const p of e.plaene) {
    if (!p.client_id) continue
    const b = bilanz(p.month_key)
    if (p.zahlstatus === 'bezahlt' && p.dabei !== false) { b.umsatz += n(p.betrag); b.xp += XP.rechnungBezahlt + Math.floor(n(p.betrag) / 100) * XP.je100Euro }
  }
  const monate = [...monatMap.values()].sort((a, b) => b.key.localeCompare(a.key))
  const maxViews = Math.max(0, ...monate.map((m) => m.views))
  const maxVideos = Math.max(0, ...monate.map((m) => m.videos))
  for (const m of monate) { m.rekordViews = m.views > 0 && m.views === maxViews; m.rekordVideos = m.videos > 0 && m.videos === maxVideos }

  // --- Quests sichtbar ------------------------------------------------------
  const quests = e.quests
    .map((q) => ({ ...q, gesperrt: q.ab_level > level.nr }))
    .filter((q) => q.status === 'offen' || q.erledigt_am)
    .sort((a, b) => Number(a.status === 'erledigt') - Number(b.status === 'erledigt') || Number(a.gesperrt) - Number(b.gesperrt) || a.sort - b.sort)

  // --- Rekorde --------------------------------------------------------------
  const rekorde: SpielStand['rekorde'] = []
  const top = [...gepostet].sort((a, b) => n(b.views) - n(a.views))[0]
  if (top) rekorde.push({ label: 'Bestes Video', wert: `${kurzZahl(n(top.views))} Views · ${top.title ?? 'Video'}`, wann: tagVon(top.posted_at) ?? '' })
  const bm = monate.find((m) => m.rekordViews)
  if (bm) rekorde.push({ label: 'Bester Monat', wert: `${kurzZahl(bm.views)} Views · ${bm.videos} Videos`, wann: bm.key })
  rekorde.push({ label: 'Längster Streak', wert: `${st.beste} ${st.beste === 1 ? 'Tag' : 'Tage'}`, wann: '' })

  if (umsatz.bester) rekorde.push({ label: 'Bester Umsatz-Monat', wert: `${Math.round(umsatz.bester.betrag).toLocaleString('de-DE')} €`, wann: umsatz.bester.key })

  return { xp, level, naechstes, fortschritt, posten, streak: st.aktuell, streakBeste: st.beste, heuteGepostet: st.heute, hits, monate, quests, rekorde, umsatz }
}

export function kurzZahl(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} Mio.`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(v)
}

export function monatName(key: string): string {
  const M = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
  return `${M[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`
}

// --------------------------------------------------------------- Die Stadt
// Jeder Kunde ist ein Gebaeude. Hoehe aus Honorar und Videomenge, Fenster
// leuchten je gepostetem Video im Monat, Kran = wird gerade geschnitten,
// Fahne = Monat abgeschlossen. Pausierte Gebaeude werden grau.

export interface Gebaeude {
  id: string
  name: string
  kurz: string
  farbe: string
  /** Stockwerke 1..12 */
  stockwerke: number
  /** Breite in Rastereinheiten 1..3 */
  breite: number
  fensterAn: number
  fensterGesamt: number
  kran: boolean
  fahne: boolean
  grau: boolean
  eigen: boolean
  logo: string | null
  ziel: number
  gepostet: number
}

const PALETTE = ['#ff5f1f', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff375f', '#64d2ff', '#ff9f0a', '#5e5ce6', '#ac8e68']

export function gebaeudeFuer(k: SKunde, i: number, stand: { gepostet: number; ziel: number; imOfen: number; gruen: boolean }): Gebaeude {
  const fee = n(k.monthly_fee)
  const quota = n(k.monthly_quota)
  // Hoehe: Honorar (bis 3000) + Videos (bis 20) -> 1..12 Stockwerke
  const stock = Math.max(2, Math.min(12, Math.round(fee / 300 + quota / 2.5)))
  const breite = fee >= 1500 || quota >= 15 ? 3 : fee >= 800 || quota >= 8 ? 2 : 1
  const fenster = Math.max(stand.ziel, stand.gepostet, 4)
  const worte = k.name.replace(/&/g, ' ').split(/\s+/).filter(Boolean)
  return {
    id: k.id, name: k.name,
    kurz: worte.length > 1 ? (worte[0][0] + worte[1][0]).toUpperCase() : k.name.slice(0, 2).toUpperCase(),
    farbe: k.brand_color || PALETTE[i % PALETTE.length],
    stockwerke: k.client_type === 'eigen' ? 6 : stock,
    breite: k.client_type === 'eigen' ? 2 : breite,
    fensterAn: Math.min(fenster, stand.gepostet), fensterGesamt: fenster,
    kran: stand.imOfen > 0, fahne: stand.gruen, grau: !!k.pausiert_seit, eigen: k.client_type === 'eigen',
    logo: k.logo_url, ziel: stand.ziel, gepostet: stand.gepostet,
  }
}
