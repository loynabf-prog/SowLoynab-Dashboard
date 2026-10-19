import { describe, it, expect } from 'vitest'
import { tiktokMeta, instagramMeta, ohneLeere, tiktokKonto } from '../../../supabase/functions/_shared/plattformMeta'

describe('tiktokMeta', () => {
  const it0 = {
    text: 'Bester Döner in Münster? #kebab #Münster #kebab',
    createTimeISO: '2026-10-18T16:30:00.000Z',
    hashtags: [{ name: 'kebab' }, { name: 'Münster' }],
    mentions: ['@kebabkumpels'],
    musicMeta: { musicName: 'original sound', musicAuthor: 'kebabkumpels', musicOriginal: true },
    videoMeta: { coverUrl: 'https://p16.tiktok/cover.jpg', duration: 21 },
    isPinned: false,
    authorMeta: { name: 'KebabKumpels', fans: 1234, following: 10, video: 50, heart: 99999 },
  }
  it('liest Uhrzeit, Caption, Tags, Sound und Cover', () => {
    const { patch, coverQuelle } = tiktokMeta(it0)
    expect(patch.tiktok_published_at).toBe('2026-10-18T16:30:00.000Z')
    expect(patch.tiktok_hashtags).toEqual(['kebab', 'münster'])
    expect(patch.tiktok_mentions).toEqual(['kebabkumpels'])
    expect(patch.tiktok_sound).toBe('original sound – kebabkumpels')
    expect(patch.tiktok_sound_original).toBe(true)
    expect(coverQuelle).toBe('https://p16.tiktok/cover.jpg')
  })
  it('liest Sekunden-Zeitstempel und Hashtags notfalls aus dem Text', () => {
    const { patch } = tiktokMeta({ text: 'Neu! #Burger', createTime: 1760805000 })
    expect(patch.tiktok_published_at).toBe(new Date(1760805000 * 1000).toISOString())
    expect(patch.tiktok_hashtags).toEqual(['burger'])
  })
  it('liest den Account-Stand', () => {
    expect(tiktokKonto(it0)).toEqual({ handle: 'kebabkumpels', followers: 1234, following: 10, posts: 50, likesGesamt: 99999 })
    expect(tiktokKonto({})).toBeNull()
  })
})

describe('instagramMeta', () => {
  it('erkennt Reel, Sound, Collabs und Kommentare', () => {
    const { patch, coverQuelle } = instagramMeta({
      caption: 'Was bestellst du? 🍔', timestamp: '2026-10-18T17:00:00.000Z',
      hashtags: ['burger'], mentions: [], type: 'Video', productType: 'clips',
      musicInfo: { song_name: 'Song', artist_name: 'Artist', uses_original_audio: false },
      locationName: 'Münster', coauthorProducers: [{ username: 'sowloynab' }],
      latestComments: [{ text: 'Lecker!', likesCount: 2, timestamp: '2026-10-18T18:00:00Z', ownerUsername: 'x' }, { text: '' }],
      displayUrl: 'https://ig/cover.jpg',
    })
    expect(patch.ig_type).toBe('reel')
    expect(patch.ig_sound).toBe('Song – Artist')
    expect(patch.ig_sound_original).toBe(false)
    expect(patch.ig_collabs).toEqual(['sowloynab'])
    expect(patch.ig_location).toBe('Münster')
    expect(patch.ig_comments_sample).toEqual([{ text: 'Lecker!', likes: 2, zeit: '2026-10-18T18:00:00Z' }])
    expect(coverQuelle).toBe('https://ig/cover.jpg')
  })
  it('nennt Originalton ohne Songtitel so', () => {
    expect(instagramMeta({ type: 'Sidecar', musicInfo: { uses_original_audio: true } }).patch.ig_sound).toBe('Originalton')
    expect(instagramMeta({ type: 'Sidecar' }).patch.ig_type).toBe('karussell')
  })
})

describe('ohneLeere', () => {
  it('wirft null und undefined raus, behaelt false und leere Listen', () => {
    expect(ohneLeere({ a: null, b: undefined, c: false, d: [], e: 'x' })).toEqual({ c: false, d: [], e: 'x' })
  })
})
