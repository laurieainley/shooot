import { describe, it, expect } from 'vitest'
import { centredBaseline, clampInto, paintOps, textInkMetrics } from './paint'
import type { DrawOp } from './layout'

type Metrics = { actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number; width: number }

/** A fake 2D context that records fillText calls; `metrics(font)` stands in for the platform's font metrics. */
function fakeCtx(metrics: (font: string) => Metrics, w = 1920, h = 1080) {
    const calls: { text: string; x: number; y: number; baseline: string }[] = []
    let font = ''
    const ctx = {
        canvas: { width: w, height: h },
        textBaseline: 'alphabetic', textAlign: 'left', fillStyle: '', globalAlpha: 1, lineWidth: 1, strokeStyle: '',
        get font() { return font }, set font(v: string) { font = v },
        save() {}, restore() {}, setTransform() {},
        measureText: () => metrics(font),
        fillText(text: string, x: number, y: number) { calls.push({ text, x, y, baseline: ctx.textBaseline }) },
        fillRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    }
    return { ctx: ctx as unknown as OffscreenCanvasRenderingContext2D, calls }
}

describe('centredBaseline', () => {
    it('should put the ink box (ascent above, descent below the baseline) centred on the given y', () => {
        // ascent 30, descent 0: the baseline sits 15 below the centre
        expect(centredBaseline(100, 30, 0)).toBe(115)
        // ascent 30, descent 10: ink spans baseline-30 .. baseline+10, centre = baseline-10
        expect(centredBaseline(100, 30, 10)).toBe(110)
        expect(centredBaseline(100, 20, 20)).toBe(100)
    })
})

describe('clampInto', () => {
    const box = { x: 0, y: 0, w: 100, h: 50 }
    it('should leave a rectangle that fits where it is', () => {
        expect(clampInto(box, { x: 10, y: 10, w: 20, h: 20 })).toEqual({ x: 10, y: 10, w: 20, h: 20 })
    })
    it('should pull a rectangle poking out of the bottom back inside', () => {
        expect(clampInto(box, { x: 10, y: 40, w: 20, h: 20 })).toEqual({ x: 10, y: 30, w: 20, h: 20 })
    })
    it('should shrink a rectangle larger than the box, keeping its aspect ratio and centring it', () => {
        expect(clampInto(box, { x: -20, y: -20, w: 200, h: 100 })).toEqual({ x: 0, y: 0, w: 100, h: 50 })
        const r = clampInto(box, { x: 0, y: 0, w: 100, h: 100 })
        expect(r).toEqual({ x: 25, y: 0, w: 50, h: 50 })
    })
})

describe('textInkMetrics', () => {
    it('should use the measured bounding box of cap and digit glyphs', () => {
        const { ctx } = fakeCtx(() => ({ width: 10, actualBoundingBoxAscent: 31, actualBoundingBoxDescent: 1 }))
        expect(textInkMetrics(ctx, 44)).toEqual({ ascent: 31, descent: 1 })
    })
    it('should fall back to proportions of the font size when the platform gives no bounding box', () => {
        const { ctx } = fakeCtx(() => ({ width: 10 }))
        const m = textInkMetrics(ctx, 100)
        expect(m.ascent).toBeGreaterThan(50)
        expect(m.descent).toBe(0)
    })
})

describe('paintOps text', () => {
    const op = (size: number, y: number): DrawOp => ({ kind: 'text', text: 'GOAL', x: 0, y, size, color: '#fff', align: 'left', baseline: 'middle' })

    it('should centre middle-baseline text on its y from measured metrics, whatever the font (fallback metrics included)', () => {
        // two "platforms" with different ascent/descent proportions: the ink must centre on y for both
        for (const [asc, desc] of [[0.7, 0], [0.82, 0.18]]) {
            const { ctx, calls } = fakeCtx((f) => { const s = parseFloat(f); return { width: 1, actualBoundingBoxAscent: asc * s, actualBoundingBoxDescent: desc * s } })
            paintOps(ctx, [op(100, 500)], { logo: null })
            const inkCentre = calls[0].y - (asc * 100 - desc * 100) / 2
            expect(calls[0].baseline).toBe('alphabetic')
            expect(Math.abs(inkCentre - 500)).toBeLessThan(0.01)
        }
    })

    it('should draw alphabetic text at the baseline given', () => {
        const { ctx, calls } = fakeCtx(() => ({ width: 1, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 0 }))
        paintOps(ctx, [{ ...(op(100, 321) as object), baseline: 'alphabetic' } as DrawOp], { logo: null })
        expect(calls[0]).toMatchObject({ y: 321, baseline: 'alphabetic' })
    })
})
