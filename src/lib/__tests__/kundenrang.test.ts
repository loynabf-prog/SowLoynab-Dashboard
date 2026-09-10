import { describe, expect, it } from 'vitest'
import { kundenlage } from '../kundenrang'
import type { Client, Video } from '../types'

const HEUTE = '2026-09-10'

const c = (p: Partial<Client> = {}): Client => ({
  id: 'c', name: 'Testkunde', logo_url: null, handle_ig: null, handle_tiktok: null,
  notes: null, package: null, monthly_fee: null, active: true, ai_brief: null,
  brand_notes: null, city: null, contact_person: null, phone: null, email: null,
  website: null, health: null, monthly_quota: null, contract_end: null,
  created_by: null, created_at: '', updated_at: '', ...p,
} as Client)

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

describe('kundenlage', () => {
  it('ein Video zum Drehen macht den Kunden akut', () => {
    const l = kundenlage(c(), [v({ status: 'todo', scheduled_date: '2026-09-12' })], HEUTE)
    expect(l.rang).toBe('akut')
    expect(l.grund).toContain('1 zu drehen')
  })

  it('ein fertiges Video, das nur auf seinen Termin wartet, ist KEINE Arbeit', () => {
    const l = kundenlage(c(), [v({ status: 'ready', scheduled_date: '2026-09-12' })], HEUTE)
    expect(l.rang).toBe('laeuft')
    expect(l.zuTun).toBe(0)
  })

  it('Retainer mit Luecke ist akut', () => {
    const vids = Array.from({ length: 5 }, () => v({ status: 'ready', scheduled_date: '2026-09-15' }))
    const l = kundenlage(c({ monthly_quota: 16 }), vids, HEUTE)
    expect(l.rang).toBe('akut')
    expect(l.ohneIdee).toBe(11)
    expect(l.grund).toContain('11 ohne Idee')
  })

  it('Retainer ohne Luecke laeuft nur', () => {
    const vids = Array.from({ length: 8 }, () => v({ status: 'planned', scheduled_date: '2026-09-15' }))
    const l = kundenlage(c({ monthly_quota: 8 }), vids, HEUTE)
    expect(l.rang).toBe('laeuft')
  })

  it('ein gepostetes Video ohne Link holt den Kunden nach vorne', () => {
    const l = kundenlage(c(), [v({ status: 'posted', posted_at: '2026-09-08T10:00:00Z' })], HEUTE)
    expect(l.rang).toBe('akut')
    expect(l.grund).toContain('1 ohne Link')
  })

  it('abgeschlossenes Projekt rutscht nach ruhend', () => {
    const l = kundenlage(c(), [
      v({ status: 'posted', posted_at: '2026-06-01T10:00:00Z', tiktok_url: 'https://tiktok.com/x' }),
    ], HEUTE)
    expect(l.rang).toBe('ruhend')
    expect(l.grund).toBe('kein offener Auftrag')
  })

  it('inaktiv gesetzt ist immer ruhend, auch mit offener Arbeit', () => {
    const l = kundenlage(c({ active: false }), [v({ status: 'todo' })], HEUTE)
    expect(l.rang).toBe('ruhend')
  })

  it('Video ohne Termin zaehlt immer als Arbeit', () => {
    const l = kundenlage(c(), [v({ status: 'todo', scheduled_date: null })], HEUTE)
    expect(l.zuTun).toBe(1)
  })

  it('Arbeit weit in der Zukunft macht noch nicht akut', () => {
    const l = kundenlage(c(), [v({ status: 'todo', scheduled_date: '2026-09-28' })], HEUTE)
    expect(l.zuTun).toBe(0)
    expect(l.rang).toBe('laeuft')
  })
})
