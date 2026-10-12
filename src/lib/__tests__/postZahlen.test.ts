import { describe, it, expect } from 'vitest'
import { instagramZahlen, summe, tiktokZahlen } from '../../../supabase/functions/fetch-post-links/index'

// Die Zahlen werden an ZWEI Stellen aus den Apify-Antworten gelesen: beim
// automatischen Abholen direkt nach dem Posten und beim naechtlichen Lauf
// (refresh-stats). Lesen die beiden unterschiedliche Felder, springen die
// Zahlen ueber Nacht. Dieser Test haelt die Zuordnung fest.
describe('tiktokZahlen', () => {
  it('liest die Felder des TikTok-Scrapers', () => {
    expect(tiktokZahlen({
      playCount: 15000, diggCount: 820, commentCount: 44, shareCount: 12,
      collectCount: 90, videoMeta: { duration: 27 },
    })).toEqual({ views: 15000, likes: 820, comments: 44, shares: 12, saves: 90, duration: 27 })
  })
  it('kommt mit den aelteren Feldnamen klar', () => {
    const z = tiktokZahlen({ views: 100, likes: 5, comments: 1, shares: 0, saves: 2, duration: 30 })
    expect(z.views).toBe(100)
    expect(z.likes).toBe(5)
  })
  it('laesst fehlende Werte leer statt sie auf null zu setzen', () => {
    expect(tiktokZahlen({ playCount: 10 })).toEqual({
      views: 10, likes: null, comments: null, shares: null, saves: null, duration: null,
    })
  })
  it('nimmt auch Zahlen, die als Text kommen', () => {
    expect(tiktokZahlen({ playCount: '2500' }).views).toBe(2500)
  })
})

describe('instagramZahlen', () => {
  it('liest die Felder des Instagram-Scrapers', () => {
    expect(instagramZahlen({
      videoViewCount: 8400, likesCount: 310, commentsCount: 19,
      sharesCount: 7, savesCount: 55, videoDuration: 31,
    })).toEqual({ views: 8400, likes: 310, comments: 19, shares: 7, saves: 55, duration: 31 })
  })
  it('faellt auf videoPlayCount zurueck', () => {
    expect(instagramZahlen({ videoPlayCount: 1200 }).views).toBe(1200)
  })
})

describe('summe', () => {
  it('zaehlt beide Plattformen zusammen', () => {
    expect(summe(1000, 500)).toBe(1500)
  })
  it('nimmt die eine, wenn die andere fehlt', () => {
    expect(summe(1000, null)).toBe(1000)
    expect(summe(null, 500)).toBe(500)
  })
  it('bleibt leer, wenn nirgends eine Zahl steht -- 0 waere eine Behauptung', () => {
    expect(summe(null, null)).toBeNull()
  })
  it('behaelt eine echte Null', () => {
    expect(summe(0, null)).toBe(0)
  })
})
