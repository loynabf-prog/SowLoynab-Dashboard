import { describe, it, expect } from 'vitest'
import { brennt } from '../../../supabase/functions/daily-reminders/brennt'
import { fristInfo } from '../fristen'

// Der Morgen-Push muss genau dasselbe "brennt" melden wie die Posting-Seite.
const HEUTE = '2026-10-18'
const STATUS = ['todo', 'ready', 'planned'] as const

describe('Morgen-Push und Posting-Seite sind sich einig', () => {
  it('fuer alle Kombinationen aus Stand, Abstand und Drehtag', () => {
    let geprueft = 0
    for (const status of STATUS) {
      for (const shot of [false, true]) for (const edited of [false, true]) for (const sched of [false, true]) {
        for (let tage = -5; tage <= 30; tage++) {
          for (const dreh of [null, -3, 0, 4, 25]) {
            const d = new Date(HEUTE + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + tage)
            const scheduled_date = d.toISOString().slice(0, 10)
            let drehtag: string | null = null
            if (dreh != null) { const e = new Date(HEUTE + 'T12:00:00Z'); e.setUTCDate(e.getUTCDate() + dreh); drehtag = e.toISOString().slice(0, 10) }
            const v = { status, scheduled_date, prep_shot: shot, prep_edited: edited, prep_scheduled: sched, drehtag }
            expect(brennt(v, HEUTE), JSON.stringify(v)).toBe(fristInfo(v, HEUTE).ampel === 'rot')
            geprueft++
          }
        }
      }
    }
    expect(geprueft).toBeGreaterThan(1000)
  })
})
