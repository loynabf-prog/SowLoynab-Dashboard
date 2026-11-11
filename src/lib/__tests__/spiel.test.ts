import { describe, it, expect } from 'vitest'
import { LEVEL, XP, followerStand, gebaeudeFuer, levelFuer, spielStand, streakVon, tageBis, umsatzStand, viewsXp, zielStand, type SKunde, type SVideo, type SZiel, type ZielWerte } from '../spiel'

const k = (x: Partial<SKunde> & { id: string }): SKunde => ({
  name: x.id, client_type: 'zahlend', monthly_fee: 1000, monthly_quota: 10, active: true, pausiert_seit: null, logo_url: null, brand_color: null, ...x,
})
const v = (x: Partial<SVideo> & { id: string; client_id: string }): SVideo => ({ title: x.id, posted_at: '2026-10-10T10:00:00Z', views: 1000, ...x })

describe('XP', () => {
  it('Views-XP je 10k, gedeckelt', () => {
    expect(viewsXp(0)).toBe(0)
    expect(viewsXp(9_999)).toBe(25)
    expect(viewsXp(35_000)).toBe(100)
    expect(viewsXp(1_000_000)).toBe(XP.viewsDeckelJeVideo)
  })
  it('Level steigen mit XP', () => {
    expect(levelFuer(0).level.name).toBe('Garage')
    expect(levelFuer(3_000).level.name).toBe('Studio')
    const l = levelFuer(12_000)
    expect(l.level.name).toBe('Agentur')
    expect(l.naechstes?.name).toBe('Boutique')
    expect(l.fortschritt).toBeCloseTo(0.5)
    expect(levelFuer(999_999).naechstes).toBeNull()
    expect(LEVEL.map((x) => x.ab)).toEqual([...LEVEL.map((x) => x.ab)].sort((a, b) => a - b))
  })
})

describe('Streak', () => {
  it('zaehlt Tage in Folge bis heute oder gestern', () => {
    const s = streakVon(new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']), '2026-10-30')
    expect(s.aktuell).toBe(4)
    expect(s.heute).toBe(false)
    expect(streakVon(new Set(['2026-10-20']), '2026-10-30').aktuell).toBe(0)
    expect(streakVon(new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-30']), '2026-10-30').beste).toBe(3)
  })
})

describe('spielStand', () => {
  const kunden = [k({ id: 'a' }), k({ id: 'eig', client_type: 'eigen', monthly_fee: null, monthly_quota: null })]
  it('rechnet Posten zusammen, eigene Videos mehr wert', () => {
    const s = spielStand({
      kunden,
      videos: [v({ id: '1', client_id: 'a', views: 12_000 }), v({ id: '2', client_id: 'eig', views: 500 })],
      kontrollen: [{ client_id: 'a', month_key: '2026-09', geprueft_bis: '2026-09-30' }, { client_id: 'a', month_key: '2026-10', geprueft_bis: '2026-10-15' }],
      plaene: [{ client_id: 'a', month_key: '2026-09', zahlstatus: 'bezahlt', betrag: 1000, quota: 10 }],
      quests: [{ id: 'q', titel: 'PKV', beschreibung: null, xp: 500, art: 'aufgabe', status: 'erledigt', faellig: null, ab_level: 0, sort: 0, erledigt_am: '2026-10-01' }],
      heute: '2026-10-30',
    })
    const p = Object.fromEntries(s.posten.map((x) => [x.key, x.xp]))
    expect(p.videos).toBe(50)
    expect(p.eigene).toBe(80)
    expect(p.views).toBe(50 + 25)
    expect(p.gruen).toBe(300)      // nur September ist bis Monatsende gestempelt
    expect(p.bezahlt).toBe(200)
    expect(p.kunden).toBe(1000)    // a hat gepostet, eigen zaehlt nicht
    expect(p.quests).toBe(500)
    expect(p.umsatz).toBe(100)     // 1000 EUR bezahlt = 10 x 10 XP
    expect(s.xp).toBe(50 + 80 + 75 + 300 + 200 + 100 + 1000 + 500)
    expect(s.level.name).toBe('Garage')
    expect(s.monate[0].key).toBe('2026-10')
    expect(s.monate.find((m) => m.key === '2026-09')?.umsatz).toBe(1000)
    // Umsatz: Oktober hat keinen Plan -> Honorar des aktiven Kunden als Schaetzung
    expect(s.umsatz.monat).toBe('2026-10')
    expect(s.umsatz.proKunde[0]?.geschaetzt).toBe(true)
    expect(s.umsatz.gesamtBezahlt).toBe(1000)
    expect(s.umsatz.vormonat.gestellt).toBe(1000)
  })
  it('Hits ab 5 Videos und 2x Median', () => {
    const videos = [100, 100, 100, 100, 1000].map((views, i) => v({ id: 'v' + i, client_id: 'a', views }))
    const s = spielStand({ kunden, videos, kontrollen: [], plaene: [], quests: [], heute: '2026-10-30' })
    expect(s.hits).toHaveLength(1)
    expect(s.hits[0].video.id).toBe('v4')
  })
  it('Quests: gesperrt ueber dem Level', () => {
    const s = spielStand({ kunden, videos: [], kontrollen: [], plaene: [], heute: '2026-10-30', quests: [
      { id: '1', titel: 'Büro', beschreibung: null, xp: 3000, art: 'meilenstein', status: 'offen', faellig: null, ab_level: 3, sort: 2, erledigt_am: null },
      { id: '2', titel: 'PB', beschreibung: null, xp: 2000, art: 'meilenstein', status: 'offen', faellig: null, ab_level: 0, sort: 1, erledigt_am: null },
    ] })
    expect(s.quests.map((q) => q.titel)).toEqual(['PB', 'Büro'])
    expect(s.quests[1].gesperrt).toBe(true)
  })
})

describe('Gebaeude', () => {
  it('groesser bei mehr Honorar und Videos', () => {
    const klein = gebaeudeFuer(k({ id: 'k', monthly_fee: 300, monthly_quota: 4 }), 0, { gepostet: 2, ziel: 4, imOfen: 0, gruen: false })
    const gross = gebaeudeFuer(k({ id: 'g', monthly_fee: 2000, monthly_quota: 15 }), 1, { gepostet: 3, ziel: 15, imOfen: 1, gruen: true })
    expect(gross.stockwerke).toBeGreaterThan(klein.stockwerke)
    expect(gross.breite).toBe(3)
    expect(gross.kran).toBe(true)
    expect(gross.fahne).toBe(true)
    expect(klein.fensterAn).toBe(2)
    expect(gross.kurz).toBe('G')
  })
})

describe('umsatzStand', () => {
  it('Monatsplan schlaegt Honorar, nicht-dabei zaehlt nicht, Meilensteine aus dem besten Monat', () => {
    const u = umsatzStand(
      [k({ id: 'a', monthly_fee: 1000 }), k({ id: 'b', monthly_fee: 800 }), k({ id: 'c', monthly_fee: 500, pausiert_seit: '2026-10-01' })],
      [
        { client_id: 'a', month_key: '2026-10', zahlstatus: 'bezahlt', betrag: 1500, quota: 10 },
        { client_id: 'b', month_key: '2026-10', zahlstatus: 'offen', betrag: 0, quota: 0, dabei: false },
        { client_id: 'a', month_key: '2026-09', zahlstatus: 'bezahlt', betrag: 2600, quota: 10 },
      ],
      '2026-10-30',
    )
    expect(u.gestellt).toBe(1500)        // b bewusst nicht dabei, c pausiert
    expect(u.bezahlt).toBe(1500)
    expect(u.gesamtBezahlt).toBe(4100)
    expect(u.bester).toEqual({ key: '2026-09', betrag: 2600 })
    expect(u.erreicht).toEqual([2500])
    expect(u.naechster).toBe(2500)
    expect(u.fortschritt).toBeCloseTo(0.6)
  })
})

describe('Tycoon: Follower, Ziele, Ort', () => {
  const z = (x: Partial<SZiel> & { id: string }): SZiel => ({ titel: x.id, belohnung: null, typ: 'follower', wert: null, datum: null, schluessel: null, eingeloest_am: null, sort: 0, ...x })
  const w: ZielWerte = { follower: 1302, umsatz: 6850, videos: 128, kunden: 5, level: 2, heute: '2026-11-11' }

  it('Follower: TikTok + Instagram zusammen, je volle 1.000 eine Marke', () => {
    const f = followerStand({ tiktok: 494, instagram: 808 })
    expect(f.gesamt).toBe(1302)
    expect(f.marken).toBe(1)
    expect(f.naechste).toBe(2000)
    expect(f.fortschritt).toBeCloseTo(0.302)
    expect(followerStand(undefined).gesamt).toBe(0)
  })

  it('Ziel nach Zahl: erreicht erst, wenn die echte Zahl stimmt', () => {
    expect(zielStand(z({ id: 'a', typ: 'follower', wert: 5000 }), w).erreicht).toBe(false)
    expect(zielStand(z({ id: 'a', typ: 'follower', wert: 5000 }), w).fortschritt).toBeCloseTo(0.2604)
    expect(zielStand(z({ id: 'b', typ: 'follower', wert: 1000 }), w).erreicht).toBe(true)
    expect(zielStand(z({ id: 'c', typ: 'umsatz', wert: 10000 }), w).erreicht).toBe(false)
    expect(zielStand(z({ id: 'd', typ: 'kunden', wert: 5 }), w).erreicht).toBe(true)
    expect(zielStand(z({ id: 'e', typ: 'videos', wert: 100, eingeloest_am: '2026-11-01T10:00:00Z' }), w).eingeloest).toBe(true)
  })

  it('Ziel nach Datum: Countdown, am Tag selbst erreicht', () => {
    expect(tageBis('2026-11-11', '2026-12-01')).toBe(20)
    const vor = zielStand(z({ id: 'b', typ: 'datum', datum: '2026-12-01' }), w)
    expect(vor.erreicht).toBe(false)
    expect(vor.text).toBe('in 20 Tagen')
    expect(zielStand(z({ id: 'b', typ: 'datum', datum: '2026-12-01' }), { ...w, heute: '2026-12-01' }).erreicht).toBe(true)
  })

  it('Ort: Café bis zum Büro-Ziel, danach Büro; ohne Ziel Büro', () => {
    const basis = { kunden: [k({ id: 'a' })], videos: [v({ id: 'v1', client_id: 'a' })], kontrollen: [], plaene: [], quests: [] }
    const buero = z({ id: 'b', typ: 'datum', datum: '2026-12-01', schluessel: 'buero' })
    const vor = spielStand({ ...basis, heute: '2026-11-11', ziele: [buero] })
    expect(vor.ort).toBe('cafe')
    expect(vor.bueroIn).toBe(20)
    const nach = spielStand({ ...basis, heute: '2026-12-01', ziele: [buero] })
    expect(nach.ort).toBe('buero')
    expect(nach.bueroIn).toBeNull()
    expect(spielStand({ ...basis, heute: '2026-11-11' }).ort).toBe('buero')
  })

  it('Follower bringen XP je volle 1.000', () => {
    const basis = { kunden: [k({ id: 'a' })], videos: [], kontrollen: [], plaene: [], quests: [], heute: '2026-11-11' }
    const ohne = spielStand(basis).xp
    expect(spielStand({ ...basis, follower: { tiktok: 1500, instagram: 700 } }).xp - ohne).toBe(2 * XP.je1000Follower)
  })
})
