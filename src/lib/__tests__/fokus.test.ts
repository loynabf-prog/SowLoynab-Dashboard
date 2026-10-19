import { describe, it, expect } from 'vitest'
import { gehoertMir, machTag, ringSatz, TAGESZIEL } from '../fokus'
import type { Lage, Punkt } from '../tageslage'

const p = (key: string, ampel: Punkt['ampel'] = 'rot'): Punkt => ({
  key, id: key, art: 'dreh', titel: key, kunde: null, zeit: null, text: '', ampel, ziel: '/',
})
const lage = (brennt: Punkt[], heute: Punkt[] = [], vorarbeit: Punkt[] = []): Lage => ({
  brennt, heute, vorarbeit, ruhig: brennt.length === 0 && heute.length === 0,
})

describe('gehoertMir', () => {
  it('ohne Zuordnung gehoert es allen', () => {
    expect(gehoertMir([], 'a')).toBe(true)
    expect(gehoertMir(null, 'a')).toBe(true)
  })
  it('zugeordnet nur dem Mitglied', () => {
    expect(gehoertMir(['b'], 'a')).toBe(false)
    expect(gehoertMir(['a', 'b'], 'a')).toBe(true)
  })
  it('ohne gewaehlte Person sieht man alles', () => {
    expect(gehoertMir(['b'], null)).toBe(true)
  })
})

describe('machTag', () => {
  const viele = Array.from({ length: 26 }, (_, i) => p('v' + i))
  it('eine Sache im Fokus, drei danach, Rest versteckt', () => {
    const t = machTag(lage(viele), [], 0)
    expect(t.fokus?.key).toBe('v0')
    expect(t.danach.map((x) => x.key)).toEqual(['v1', 'v2', 'v3'])
    expect(t.rest).toHaveLength(22)
  })
  it('Tagesziel ist hoechstens fuenf', () => {
    expect(machTag(lage(viele), [], 0).ziel).toBe(TAGESZIEL)
    expect(machTag(lage([p('a'), p('b')]), [], 0).ziel).toBe(2)
  })
  it('Spaeter schiebt ans Ende', () => {
    const t = machTag(lage([p('a'), p('b'), p('c')]), ['a'], 0)
    expect(t.fokus?.key).toBe('b')
    expect(t.danach.map((x) => x.key)).toEqual(['c', 'a'])
  })
  it('ruhiger Tag bietet Vorarbeit an', () => {
    const t = machTag(lage([], [], [p('x', 'gruen')]), [], 0)
    expect(t.ruhig).toBe(true)
    expect(t.fokus?.key).toBe('x')
  })
})

describe('ringSatz', () => {
  it('zaehlt bis zum Ziel', () => {
    expect(ringSatz(machTag(lage([p('a'), p('b'), p('c')]), [], 2)).oben).toBe('2 von 5 geschafft')
  })
  it('meldet das erreichte Ziel', () => {
    expect(ringSatz(machTag(lage([p('a')]), [], 5)).oben).toBe('Tagesziel geschafft')
  })
})
