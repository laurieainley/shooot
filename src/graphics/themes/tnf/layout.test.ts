import { describe, it, expect } from 'vitest'
import { captionLayout, cardLayout, replayTagLayout, scoreBugLayout, type DrawOp, type PolyOp, type RectOp, type TextOp } from './layout'
import { T } from './colors'
import type { BugSpec, CaptionSpec, CardSpec } from '../../types'

const left = { name: "RYAN'S ROVERS", initials: 'RR', colour: '#f0f0f0', ink: '#000' }
const right = { name: 'WALFORD TOWN', initials: 'WT', colour: '#ec5fa4', ink: '#fff' }
const vs: CardSpec = { heading: 'MATCHDAY 1', centre: 'VS', left, right }
const bug: BugSpec = { left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text: '1–0' }
const cap: CaptionSpec = { label: 'GOAL!', tone: 'goal', person: 'SAM TAYLOR', minute: "13'", assist: 'JO PARKER', note: 'GREAT MOVE', stripe: '#f0f0f0', bug }
const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.kind === 'text')
const rects = (ops: DrawOp[]): RectOp[] => ops.filter((o): o is RectOp => o.kind === 'rect')
const fills = (ops: DrawOp[]): string[] => ops.flatMap((o) => (o.kind === 'rect' || o.kind === 'poly' || o.kind === 'circle' ? [o.fill] : []))

describe('tnf layouts (Shooot geometry, TNF palette)', () => {
    it('should draw the event slab in shirt yellow with navy text, leaning like Shooot', () => {
        const ops = captionLayout(cap, 2.5, true)
        expect(texts(ops).find((o) => o.text === 'GOAL!')).toMatchObject({ color: T.navy, skew: expect.any(Number) })
        expect(rects(ops).some((r) => r.fill === T.yellow && r.skew !== undefined)).toBe(true)
    })

    it('should use no Shooot lime or ground colours', () => {
        const all = [...captionLayout(cap, 2.5, true), ...scoreBugLayout(bug, 2, 5, true, false), ...replayTagLayout(2, 5), ...cardLayout(vs, 2, 4, true)]
        expect(fills(all)).not.toContain('#A8F03C')
        expect(fills(all)).toContain(T.yellow)
    })

    it('should keep the secondary lines well under the scorer name size', () => {
        const ops = texts(captionLayout(cap, 2.5, true))
        const name = ops.find((o) => o.text === 'SAM TAYLOR')!
        const assist = ops.find((o) => o.text === 'ASSIST: JO PARKER')!
        expect(assist.size / name.size).toBeLessThan(0.66)
    })

    it('should have only sharp shapes (no rounded rects or pills)', () => {
        for (const o of rects(cardLayout(vs, 2, 4, true))) expect('r' in o).toBe(false)
    })

    it('should add the orange and white stripe band to cards', () => {
        const ops = cardLayout(vs, 2, 4, true)
        expect(rects(ops).some((r) => r.fill === T.orange)).toBe(true)
        expect(rects(ops).some((r) => r.fill === T.white && r.h < 40)).toBe(true)
    })

    it('should keep the VS split field', () => {
        expect(cardLayout(vs, 2, 4, true).some((o): o is PolyOp => o.kind === 'poly')).toBe(true)
    })
})
