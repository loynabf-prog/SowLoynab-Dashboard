import { describe, it, expect } from 'vitest'
import {
  normalisiere, median, indexJeVideo, blockVon, zeitRaster, besteZeit, vergleiche, plattformVerhaeltnis,
  topVideos, spaetzuender, sounds, faktorText, prozentText, kurzZahl, imZeitraum, MIN_GRUPPE, type AnalyseVideo,
  proMonat, followerVerlauf,
} from '../analyse'

let n = 0
function v(p: Partial<AnalyseVideo> & { client_id?: string }): AnalyseVideo {
  n++
  return normalisiere({
    id: 'v' + n, client_id: 'k1', title: 'Video ' + n, veroeffentlicht: '2026-10-10T16:00:00Z', wochentag: 6, stunde: 18, zeit_echt: true,
    duration_seconds: 15, views: 1000, views_tiktok: null, views_ig: null, likes: null, comments: null,
    engagement_rate_tiktok: null, engagement_rate_ig: null, share_rate_tiktok: null, save_rate_tiktok: null,
    views_pro_follower_tiktok: null, views_pro_follower_ig: null, views_tag1: null, views_tag7: null, views_tag28: null,
    caption_frage: null, caption_laenge: null, hashtag_anzahl: null, tiktok_sound: null, tiktok_sound_original: null,
    ig_sound_original: null, ig_type: null, cover: null, tiktok_url: null, instagram_url: null, ...p,
  })
}

describe('Grundlagen', () => {
  it('wandelt Text-Zahlen aus Postgres um', () => {
    expect(normalisiere({ id: 'x', share_rate_tiktok: '0.0123', views: '50' } as any).share_rate_tiktok).toBe(0.0123)
  })
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('Index misst jedes Video am eigenen Kunden', () => {
    const a = [v({ views: 100 }), v({ views: 200 }), v({ views: 300 })]
    const b = [v({ client_id: 'k2', views: 10_000 }), v({ client_id: 'k2', views: 20_000 }), v({ client_id: 'k2', views: 40_000 })]
    const idx = indexJeVideo([...a, ...b])
    expect(idx.get(a[2].id)).toBe(1.5)
    expect(idx.get(b[2].id)).toBe(2)
    expect(idx.get(b[0].id)).toBe(0.5)
  })
  it('Tageszeit-Bloecke', () => {
    expect(blockVon(7)).toBe('morgen')
    expect(blockVon(19)).toBe('abend')
    expect(blockVon(23)).toBe('spaet')
    expect(blockVon(2)).toBe('nacht')
    expect(blockVon(null)).toBeNull()
  })
})

describe('Beste Zeit', () => {
  it('findet das Feld mit dem hoechsten Median, nur mit genug Videos', () => {
    const vids = [
      ...[300, 320, 340].map((views) => v({ views, wochentag: 4, stunde: 18 })),
      ...[100, 110, 90].map((views) => v({ views, wochentag: 1, stunde: 9 })),
      v({ views: 5000, wochentag: 7, stunde: 12 }), // Einzelfall darf nicht gewinnen
      ...[9000, 9000, 9000].map((views) => v({ views, wochentag: 2, stunde: 12, zeit_echt: false })), // Platzhalter-Uhrzeit
    ]
    const idx = indexJeVideo(vids)
    const r = zeitRaster(vids, idx)
    expect(r[4].abend.n).toBe(3)
    const b = besteZeit(r)
    expect(b?.tag).toBe(4)
    expect(b?.block).toBe('abend')
  })
})

describe('Vergleiche', () => {
  it('rechnet den Vorteil erst ab genug Videos je Gruppe', () => {
    const mit = Array.from({ length: MIN_GRUPPE }, () => v({ caption_frage: true, views: 200 }))
    const ohne = Array.from({ length: MIN_GRUPPE }, () => v({ caption_frage: false, views: 100 }))
    const vids = [...mit, ...ohne]
    const f = vergleiche(vids, indexJeVideo(vids)).find((x) => x.key === 'frage')!
    expect(f.a.n).toBe(MIN_GRUPPE)
    expect(f.vorteil).toBe(100)
    const wenig = [...mit.slice(0, 2), ...ohne]
    expect(vergleiche(wenig, indexJeVideo(wenig)).find((x) => x.key === 'frage')!.vorteil).toBeNull()
  })
  it('TikTok gegen Instagram nur bei Videos mit beiden Zahlen', () => {
    const r = plattformVerhaeltnis([v({ views_tiktok: 300, views_ig: 100 }), v({ views_tiktok: 100, views_ig: 100 }), v({ views_tiktok: 50 })])
    expect(r.n).toBe(2)
    expect(r.faktor).toBe(2)
  })
})

describe('Listen', () => {
  it('Top nach Share-Rate ignoriert Videos mit kaum Views', () => {
    const a = v({ share_rate_tiktok: 0.5, views_tiktok: 10 })
    const b = v({ share_rate_tiktok: 0.02, views_tiktok: 5000 })
    expect(topVideos([a, b], new Map(), 'share').map((x) => x.id)).toEqual([b.id])
  })
  it('Spaetzuender: mindestens verdoppelt nach Tag 1', () => {
    const a = v({ views_tag1: 100, views_tag28: 900 })
    const b = v({ views_tag1: 100, views_tag28: 150 })
    expect(spaetzuender([a, b]).map((x) => x.video.id)).toEqual([a.id])
  })
  it('Sounds ab zweimal benutzt', () => {
    const vids = [v({ tiktok_sound: 'A' }), v({ tiktok_sound: 'A', views: 3000 }), v({ tiktok_sound: 'B' })]
    const s = sounds(vids, indexJeVideo(vids))
    expect(s.map((x) => x.sound)).toEqual(['A'])
    expect(s[0].n).toBe(2)
  })
})

describe('Format', () => {
  it('schreibt deutsch', () => {
    expect(faktorText(1.46)).toBe('1,5×')
    expect(prozentText(0.0523)).toBe('5,2 %')
    expect(kurzZahl(15300)).toBe('15 Tsd.')
    expect(kurzZahl(1_250_000)).toBe('1,3 Mio.')
    expect(kurzZahl(980)).toBe('980')
  })
  it('Zeitraum', () => {
    const jetzt = new Date('2026-10-19T12:00:00Z')
    expect(imZeitraum(v({ veroeffentlicht: '2026-10-01T00:00:00Z' }), 30, jetzt)).toBe(true)
    expect(imZeitraum(v({ veroeffentlicht: '2026-08-01T00:00:00Z' }), 30, jetzt)).toBe(false)
    expect(imZeitraum(v({ veroeffentlicht: null }), null, jetzt)).toBe(true)
  })
})

describe('Entwicklung', () => {
  const w = (id: string, datum: string, tt: number | null, ig: number | null) =>
    normalisiere({ id, client_id: 'k', veroeffentlicht: datum, views_tiktok: tt, views_ig: ig, views: (tt ?? 0) + (ig ?? 0) })

  it('fasst Videos je Monat zusammen, getrennt nach Plattform', () => {
    const m = proMonat([w('a', '2026-09-03T10:00:00Z', 100, 50), w('b', '2026-09-20T10:00:00Z', 300, null), w('c', '2026-10-01T10:00:00Z', null, 40)])
    expect(m.map((z) => z.monat)).toEqual(['2026-09', '2026-10'])
    expect(m[0]).toMatchObject({ anzahl: 2, tiktok: 400, ig: 50, views: 450, schnitt: 225 })
    expect(m[1]).toMatchObject({ anzahl: 1, tiktok: 0, ig: 40, views: 40 })
  })

  it('Follower-Kurve springt nicht, wenn spaeter ein Kunde dazukommt', () => {
    const s = [
      { client_id: 'a', captured_on: '2026-09-01', followers_tiktok: 100, followers_ig: null },
      { client_id: 'a', captured_on: '2026-09-15', followers_tiktok: 120, followers_ig: null },
      { client_id: 'b', captured_on: '2026-09-15', followers_tiktok: 5000, followers_ig: null },
    ]
    const k = followerVerlauf(s, new Set(['a', 'b']), '2026-09-01')
    expect(k.tiktok.map((p) => p.y)).toEqual([100, 120])
    expect(k.ig).toEqual([])
  })
})
