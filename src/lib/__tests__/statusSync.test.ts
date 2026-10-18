import { describe, it, expect } from 'vitest'
import { vorarbeitPatch, statusFolgen } from '../statusSync'

const leer = { status: 'todo' as const, prep_shot: false, prep_edited: false, prep_scheduled: false }

describe('vorarbeitPatch', () => {
  it('geschnitten bringt gedreht mit und schiebt auf Bereit', () => {
    expect(vorarbeitPatch(leer, 'prep_edited', true))
      .toEqual({ prep_shot: true, prep_edited: true, prep_scheduled: false, status: 'ready' })
  })
  it('eingeplant setzt alles und schiebt auf Geplant', () => {
    expect(vorarbeitPatch(leer, 'prep_scheduled', true))
      .toEqual({ prep_shot: true, prep_edited: true, prep_scheduled: true, status: 'planned' })
  })
  it('gedreht wegnehmen nimmt die spaeteren mit', () => {
    const voll = { status: 'planned' as const, prep_shot: true, prep_edited: true, prep_scheduled: true }
    expect(vorarbeitPatch(voll, 'prep_shot', false))
      .toEqual({ prep_shot: false, prep_edited: false, prep_scheduled: false, status: 'todo' })
  })
  it('eingeplant wegnehmen faellt auf Bereit zurueck', () => {
    const voll = { status: 'planned' as const, prep_shot: true, prep_edited: true, prep_scheduled: true }
    expect(vorarbeitPatch(voll, 'prep_scheduled', false).status).toBe('ready')
  })
  it('nur gedreht bleibt Zu bearbeiten', () => {
    expect(vorarbeitPatch(leer, 'prep_shot', true).status).toBe('todo')
  })
  it('gepostet bleibt gepostet', () => {
    const p = vorarbeitPatch({ status: 'posted' }, 'prep_shot', false)
    expect(p.status).toBeUndefined()
    expect(p.prep_shot).toBe(true)
  })
})

describe('statusFolgen', () => {
  it('Geplant und Gepostet: alles an', () => {
    expect(statusFolgen('planned')).toEqual({ prep_shot: true, prep_edited: true, prep_scheduled: true })
    expect(statusFolgen('posted').prep_scheduled).toBe(true)
  })
  it('Bereit: gedreht und geschnitten', () => {
    expect(statusFolgen('ready')).toEqual({ prep_shot: true, prep_edited: true, prep_scheduled: false })
  })
  it('Zu bearbeiten behaelt gedreht', () => {
    expect(statusFolgen('todo', { prep_shot: true })).toEqual({ prep_shot: true, prep_edited: false, prep_scheduled: false })
  })
})
