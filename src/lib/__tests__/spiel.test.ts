import { describe, it, expect } from 'vitest'
import { LEVEL, XP, gebaeudeFuer, levelFuer, spielStand, streakVon, viewsXp, type SKunde, type SVideo } from '../spiel'

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
    expect(s.xp).toBe(50 + 80 + 75 + 300 + 200 + 1000 + 500)
    expect(s.level.name).toBe('Garage')
    expect(s.monate[0].key).toBe('2026-10')
    expect(s.monate.find((m) => m.key === '2026-09')?.umsatz).toBe(1000)
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
