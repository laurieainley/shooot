import { describe, it, expect } from 'vitest'
import { toRenderGraphics } from './painters'
import type { GraphicsSpec } from './types'
import { CAPTION_ROWS, REPLAY_ROWS } from './layout'

const badge = { name: 'A', initials: 'A', colour: '#fff', ink: '#000' }
const spec: GraphicsSpec = {
    intro: { heading: 'MATCHDAY 1', centre: 'VS', left: badge, right: badge },
    outro: { heading: 'FULL TIME', centre: '0 - 0', left: badge, right: badge },
    overlays: [
        { kind: 'caption', cutIndex: 2, startSec: 20, durationSec: 5, spec: { label: 'GOAL', stripe: '#fff' }, clock: { offsetSec: 0, rate: 1, totalSec: 5 }, label: 'Caption: Goal' },
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
        expect(g.overlays.map((o) => [o.cutIndex, o.startSec, o.durationSec, o.label])).toEqual([[2, 20, 5, 'Caption: Goal'], [3, 16, 5, 'Replay tag']])
    })

    it('should map overlay rows to the frame size', () => {
        const [cap, tag] = toRenderGraphics(spec, { logo: null }).overlays
        expect(cap.rows(1920, 1080)).toEqual(CAPTION_ROWS)
        const [s0, s1] = cap.rows(768, 432)
        expect(s0).toBeCloseTo(CAPTION_ROWS[0] * 0.4)
        expect(s1).toBeCloseTo(CAPTION_ROWS[1] * 0.4)
        const [a, b] = tag.rows(1920, 1440) // 4:3: design centred vertically
        expect(a).toBe(180 + REPLAY_ROWS[0])
        expect(b).toBe(180 + REPLAY_ROWS[1])
    })

    it('should leave cards out when the spec has none', () => {
        const g = toRenderGraphics({ overlays: [] }, { logo: null })
        expect(g.intro).toBeUndefined()
        expect(g.outro).toBeUndefined()
    })
})

describe('score bug painter', () => {
    /** A 2D context that records the text it is asked to draw. */
    function recorder() {
        const drawn: string[] = []
        const ctx = {
            canvas: { width: 1920, height: 1080 }, globalAlpha: 1, fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, strokeStyle: '',
            save() {}, restore() {}, setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, drawImage() {},
            measureText: (t: string) => ({ width: t.length * 20 }),
            fillText: (t: string) => { drawn.push(t) },
        }
        return { ctx: ctx as unknown as OffscreenCanvasRenderingContext2D, drawn }
    }
    const bug = (text: string) => ({ left: 'WH', right: 'CO', leftColour: '#fff', rightColour: '#f00', text })
    const [overlay] = toRenderGraphics({ overlays: [{
        kind: 'scoreBug', cutIndex: 0, startSec: 10, durationSec: 14, fadeIn: false, fadeOut: false, label: 'Score bug',
        scores: [{ fromSec: 10, bug: bug('0–0') }, { fromSec: 20, bug: bug('1–0') }],
    }] }, { logo: null }).overlays

    it('should draw the score in force at each moment', () => {
        const r = recorder()
        overlay.paint(r.ctx, 2)
        expect(r.drawn).toEqual(['WH', '0–0', 'CO'])
    })

    it('should cover the whole cut when the window runs through it, and start a carried-on caption with its cut', () => {
        expect(overlay.anchor).toBe('wholeCut')
        const [cap] = toRenderGraphics({ overlays: [{ kind: 'caption', cutIndex: 1, startSec: 16, durationSec: 0.5, spec: { label: 'GOAL', stripe: '#fff' }, clock: { offsetSec: 4, rate: 2, totalSec: 5 }, fromCutStart: true, label: 'c' }] }, { logo: null }).overlays
        expect(cap.anchor).toBe('fromCutStart')
        expect(toRenderGraphics(spec, { logo: null }).overlays[1].anchor).toBe('stretchToCut')
    })
})
