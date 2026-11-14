import { describe, it, expect } from 'vitest'
import { planeAbgleich, istPlatzhalterTitel, type NeuesPosting } from '../../../supabase/functions/_shared/abgleich'

const tt = (zeit: string, url = 'tt' + zeit): NeuesPosting => ({ platform: 'tiktok', url, zeit, channel_id: null })
const ig = (zeit: string, url = 'ig' + zeit): NeuesPosting => ({ platform: 'instagram', url, zeit, channel_id: null })

describe('planeAbgleich', () => {
  it('legt TikTok und Instagram desselben Videos zusammen und füllt den Platzhalter', () => {
    const a = planeAbgleich({
      neue: [tt('2026-11-12T16:00:00Z'), ig('2026-11-12T16:20:00Z')],
      offene: [],
      platzhalter: [{ id: 'p1', scheduled_date: '2026-11-16', channel_id: null }],
    })
    expect(a).toHaveLength(1)
    expect(a[0].art).toBe('platzhalter')
    expect((a[0] as any).postings).toHaveLength(2)
  })

  it('ergänzt den fehlenden Link an einem vorhandenen Video', () => {
    const a = planeAbgleich({
      neue: [ig('2026-11-12T17:00:00Z')],
      offene: [{ id: 'v1', posted_at: '2026-11-12T16:00:00Z', channel_id: null, hatTiktok: true, hatInstagram: false }],
      platzhalter: [],
    })
    expect(a).toEqual([{ art: 'ergaenzen', videoId: 'v1', posting: expect.objectContaining({ platform: 'instagram' }) }])
  })

  it('weit auseinander = zwei Videos, ohne Platzhalter neu angelegt', () => {
    const a = planeAbgleich({ neue: [tt('2026-11-10T10:00:00Z'), ig('2026-11-13T10:00:00Z')], offene: [], platzhalter: [] })
    expect(a.map((x) => x.art)).toEqual(['neu', 'neu'])
  })

  it('zwei Videos an zwei Tagen: früheres nimmt den früheren Platzhalter', () => {
    const a = planeAbgleich({
      neue: [tt('2026-11-13T10:00:00Z'), tt('2026-11-11T10:00:00Z')],
      offene: [],
      platzhalter: [{ id: 'spaet', scheduled_date: '2026-11-20', channel_id: null }, { id: 'frueh', scheduled_date: '2026-11-16', channel_id: null }],
    })
    expect((a[0] as any).videoId).toBe('frueh')
    expect((a[0] as any).postings[0].zeit).toContain('11-11')
  })

  it('erkennt Platzhalter', () => {
    expect(istPlatzhalterTitel('November 8')).toBe(true)
    expect(istPlatzhalterTitel('R4 Führerscheinvorteile')).toBe(false)
  })
})
