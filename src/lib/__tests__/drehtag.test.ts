import { describe, it, expect } from 'vitest'
import { drehStand, type DrehVideo } from '../drehtag'

const v = (p: Partial<DrehVideo> = {}): DrehVideo =>
  ({ id: Math.random().toString(), script: null, prep_shot: false, ...p } as DrehVideo)

describe('drehStand', () => {
  it('nennt die Lücke zwischen Ziel und zugeordneten Videos', () => {
    const s = drehStand({ planned_videos: 5 }, [v(), v()])
    expect(s.soll).toBe(5)
    expect(s.dran).toBe(2)
    expect(s.fehlen).toBe(3)
  })

  it('zählt keine negative Lücke, wenn mehr dranhängt als geplant', () => {
    expect(drehStand({ planned_videos: 2 }, [v(), v(), v()]).fehlen).toBe(0)
  })

  it('zählt die Videos mit und ohne Skript', () => {
    const s = drehStand({ planned_videos: 3 }, [
      v({ script: 'SO DREHEN WIR DAS …' }), v({ script: '   ' }), v(),
    ])
    expect(s.mitSkript).toBe(1)
    expect(s.ohneSkript).toBe(2)
  })

  it('zählt, was schon gedreht ist', () => {
    const s = drehStand({ planned_videos: 3 }, [v({ prep_shot: true }), v(), v()])
    expect(s.gedreht).toBe(1)
    expect(s.fertig).toBe(false)
  })

  it('ist fertig, wenn alle zugeordneten gedreht sind', () => {
    const s = drehStand({ planned_videos: 2 }, [v({ prep_shot: true }), v({ prep_shot: true })])
    expect(s.fertig).toBe(true)
  })

  it('ein leerer Drehtag ist nicht fertig, sondern leer', () => {
    const s = drehStand({ planned_videos: 4 }, [])
    expect(s.dran).toBe(0)
    expect(s.fehlen).toBe(4)
    expect(s.fertig).toBe(false)
  })

  it('kommt ohne Ziel klar', () => {
    const s = drehStand({ planned_videos: null }, [v(), v()])
    expect(s.soll).toBe(0)
    expect(s.fehlen).toBe(0)
    expect(s.dran).toBe(2)
  })
})
