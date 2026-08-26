import { describe, expect, it } from 'vitest'
import { compactNum, detectPlatform } from '../apify'

describe('detectPlatform', () => {
  it('erkennt TikTok — lang und kurz', () => {
    expect(detectPlatform('https://www.tiktok.com/@sahin/video/7312345678901234567')).toBe('tiktok')
    expect(detectPlatform('https://vm.tiktok.com/ZGeAbCdEf/')).toBe('tiktok')
  })
  it('erkennt Instagram — Reel, Post und Kurzlink', () => {
    expect(detectPlatform('https://www.instagram.com/reel/CxYz123/')).toBe('instagram')
    expect(detectPlatform('https://instagram.com/p/CxYz123/')).toBe('instagram')
    expect(detectPlatform('https://instagr.am/p/CxYz123/')).toBe('instagram')
  })
  it('meldet alles andere als "other"', () => {
    expect(detectPlatform('https://youtube.com/shorts/abc')).toBe('other')
    expect(detectPlatform('kein link')).toBe('other')
  })
})

describe('compactNum', () => {
  it('zeigt kleine Zahlen unveraendert', () => {
    expect(compactNum(0)).toBe('0')
    expect(compactNum(999)).toBe('999')
  })
  it('kuerzt Tausender und Millionen mit deutschem Komma', () => {
    expect(compactNum(1000)).toBe('1k')
    expect(compactNum(12400)).toBe('12,4k')
    expect(compactNum(2_500_000)).toBe('2,5M')
  })
  it('zeigt fehlende Zahlen als Strich', () => {
    expect(compactNum(null)).toBe('–')
    expect(compactNum(undefined)).toBe('–')
  })
})
