import { describe, expect, it } from 'vitest'
import { imMonat, monatsplan } from '../monatsplan'
import type { Video } from '../types'

const v = (p: Partial<Video>): Video => ({
  id: Math.random().toString(), client_id: 'c', title: 't', status: 'todo',
  scheduled_date: null, scheduled_time: null, caption: null, notes: null,
  video_url: null, storage_path: null, bunny_stream_id: null, file_size: null,
  duration_seconds: null, posted_ig: false, posted_tiktok: false, posted_at: null,
  views: null, likes: null, comments: null, saves: null, shares: null, reach: null,
  share_token: null, approval_status: null, approval_note: null,
  tiktok_url: null, instagram_url: null, stats_updated_at: null,
  views_ig: null, likes_ig: null, comments_ig: null, shares_ig: null, saves_ig: null,
  views_tiktok: null, likes_tiktok: null, comments_tiktok: null, shares_tiktok: null, saves_tiktok: null,
  sort_order: null, assignee_ids: [], series_id: null, category: null,
  created_by: null, created_at: '', updated_at: '', ...p,
} as Video)

describe('imMonat', () => {
  it('zaehlt ueber den Termin', () => {
    expect(imMonat(v({ scheduled_date: '2026-09-12' }), '2026-09')).toBe(true)
    expect(imMonat(v({ scheduled_date: '2026-08-30' }), '2026-09')).toBe(false)
  })
  it('zaehlt auch ohne Termin, wenn im Monat gepostet', () => {
    expect(imMonat(v({ posted_at: '2026-09-03T10:00:00Z' }), '2026-09')).toBe(true)
  })
  it('ignoriert Videos ohne beides', () => {
    expect(imMonat(v({}), '2026-09')).toBe(false)
  })
})

describe('monatsplan', () => {
  it('rechnet die Luecke aus: 10 zugesagt, 5 angelegt -> 5 ohne Idee', () => {
    const vids = Array.from({ length: 5 }, () => v({ scheduled_date: '2026-09-10' }))
    const p = monatsplan(vids, 10, '2026-09')
    expect(p).toMatchObject({ soll: 10, angelegt: 5, gepostet: 0, offen: 5, ohneIdee: 5, fertig: false })
  })
  it('trennt gepostet von offen', () => {
    const vids = [
      v({ scheduled_date: '2026-09-01', status: 'posted', posted_at: '2026-09-01T09:00:00Z' }),
      v({ scheduled_date: '2026-09-05' }),
      v({ scheduled_date: '2026-09-09' }),
    ]
    const p = monatsplan(vids, 4, '2026-09')
    expect(p).toMatchObject({ angelegt: 3, gepostet: 1, offen: 2, ohneIdee: 1 })
  })
  it('zaehlt ein Video nicht doppelt, wenn Termin und Postdatum im Monat liegen', () => {
    const vids = [v({ scheduled_date: '2026-09-02', posted_at: '2026-09-02T12:00:00Z', status: 'posted' })]
    expect(monatsplan(vids, 1, '2026-09').angelegt).toBe(1)
  })
  it('wird nie negativ, wenn mehr angelegt ist als zugesagt', () => {
    const vids = Array.from({ length: 12 }, () => v({ scheduled_date: '2026-09-10' }))
    expect(monatsplan(vids, 10, '2026-09').ohneIdee).toBe(0)
  })
  it('meldet fertig, sobald das Soll gepostet ist', () => {
    const vids = Array.from({ length: 4 }, () => v({ scheduled_date: '2026-09-10', status: 'posted', posted_at: '2026-09-10T08:00:00Z' }))
    expect(monatsplan(vids, 4, '2026-09').fertig).toBe(true)
  })
  it('ohne Vertragsmenge gibt es keine Luecke', () => {
    expect(monatsplan([v({ scheduled_date: '2026-09-10' })], null, '2026-09').ohneIdee).toBe(0)
  })
})
