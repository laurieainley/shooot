import { describe, it, expect } from 'vitest'
import { toRenderGraphics } from './painters'
import type { GraphicsSpec } from './types'

const badge = { name: 'A', initials: 'A', colour: '#fff', ink: '#000' }
const spec: GraphicsSpec = {
    intro: { heading: 'MATCHDAY 1', centre: 'VS', left: badge, right: badge },
    outro: { heading: 'FULL TIME', centre: '0 - 0', left: badge, right: badge },
    overlays: [
        { kind: 'lowerThird', cutIndex: 2, startSec: 20, durationSec: 3, spec: { label: 'GOAL', stripe: '#fff' }, label: 'Lower third: Goal' },
        { kind: 'replayTag', cutIndex: 3, startSec: 16, durationSec: 5, label: 'Replay tag' },
    ],
}

describe('toRenderGraphics', () => {
    it('should name the cards and keep overlay timing', () => {
        const g = toRenderGraphics(spec, { logo: null })
        expect(g.intro?.label).toBe('Title card')
        expect(g.intro?.durationSec).toBe(4)
        expect(g.outro?.label).toBe('Full-time card')
        expect(g.intro?.fade?.(0)).toBe(0)
        expect(g.intro?.fade?.(2)).toBe(1)
        expect(g.overlays.map((o) => [o.cutIndex, o.startSec, o.durationSec, o.label])).toEqual([[2, 20, 3, 'Lower third: Goal'], [3, 16, 5, 'Replay tag']])
    })

    it('should map overlay rows to the frame size', () => {
        const [lt, tag] = toRenderGraphics(spec, { logo: null }).overlays
        expect(lt.rows(1920, 1080)).toEqual([770, 976])
        const [s0, s1] = lt.rows(768, 432)
        expect(s0).toBeCloseTo(308)
        expect(s1).toBeCloseTo(390.4)
        const [a, b] = tag.rows(1920, 1440) // 4:3: design centred vertically
        expect(a).toBe(180 + 56)
        expect(b).toBe(180 + 136)
    })

    it('should leave cards out when the spec has none', () => {
        const g = toRenderGraphics({ overlays: [] }, { logo: null })
        expect(g.intro).toBeUndefined()
        expect(g.outro).toBeUndefined()
    })
})
