import { describe, it, expect } from 'vitest'
import { paintOps, textInkMetrics } from './paint'
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
        save() {}, restore() {}, setTransform() {}, transform() {}, letterSpacing: '0px',
        measureText: () => metrics(font),
        fillText(text: string, x: number, y: number) { calls.push({ text, x, y, baseline: ctx.textBaseline }) },
        fillRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, strokeRect() {},
    }
    return { ctx: ctx as unknown as OffscreenCanvasRenderingContext2D, calls }
}

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
    const op = (size: number, y: number): DrawOp => ({ kind: 'text', text: 'GOAL', x: 0, y, size, color: '#fff', voice: 'stadium', align: 'left', baseline: 'middle' })

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

describe('multicolour team fill', () => {
    function recorder() {
        const fills: string[] = []
        const log: string[] = []
        const ctx = {
            canvas: { width: 1920, height: 1080 }, textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1, lineWidth: 1, strokeStyle: '', font: '', lineJoin: 'miter',
            set fillStyle(v: string) { fills.push(v) },
            save() { log.push('save') }, restore() { log.push('restore') }, setTransform() {}, transform(...a: number[]) { log.push(`transform:${a.map((n) => +n.toFixed(3)).join(',')}`) }, letterSpacing: '0px',
            measureText: () => ({ width: 10, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 0 }),
            fillText(t: string) { log.push(`fillText:${t}`) }, strokeText(t: string) { log.push(`strokeText:${t}`) },
            fillRect() { log.push('fillRect') }, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, arc() {},
            clip() { log.push('clip') }, fill() { log.push('fill') }, stroke() { log.push('stroke') },
        }
        return { ctx: ctx as unknown as OffscreenCanvasRenderingContext2D, fills, log }
    }

    it('should clip and fill a multi field with every stripe colour', () => {
        const r = recorder()
        paintOps(r.ctx, [{ kind: 'poly', points: [[0, 0], [900, 0], [800, 1080], [0, 1080]], fill: 'multi' }], { logo: null })
        expect(r.log).toContain('clip')
        for (const c of ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#f1fa8c']) expect(r.fills).toContain(c)
    })

    it('should fill a plain field with one colour', () => {
        const r = recorder()
        paintOps(r.ctx, [{ kind: 'poly', points: [[0, 0], [900, 0], [800, 1080], [0, 1080]], fill: '#336699' }], { logo: null })
        expect(r.fills).toEqual(['#336699'])
        expect(r.log).not.toContain('clip')
    })

    it('should fill a multi bar as stripes and a plain bar as one colour', () => {
        const multi = recorder()
        paintOps(multi.ctx, [{ kind: 'rect', x: 0, y: 0, w: 10, h: 70, fill: 'multi' }], { logo: null })
        expect(multi.log).toContain('clip')
        expect(multi.log).not.toContain('fillRect')
        const solid = recorder()
        paintOps(solid.ctx, [{ kind: 'rect', x: 0, y: 0, w: 10, h: 70, fill: '#ff0000' }], { logo: null })
        expect(solid.log).toContain('fillRect')
        expect(solid.fills).toEqual(['#ff0000'])
    })

    it('should draw an outline under text that asks for one', () => {
        const r = recorder()
        paintOps(r.ctx, [{ kind: 'text', text: 'WH', x: 0, y: 0, size: 100, color: '#fff', voice: 'scoreboard', align: 'center', baseline: 'middle', outline: '#000' }], { logo: null })
        const stroke = r.log.indexOf('strokeText:WH')
        expect(stroke).toBeGreaterThan(-1)
        expect(stroke).toBeLessThan(r.log.indexOf('fillText:WH'))
    })
})

describe('paintOps lean and voices', () => {
    function recorder() {
        const fonts: string[] = []
        const log: string[] = []
        const ctx = {
            canvas: { width: 1920, height: 1080 }, textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', lineJoin: 'miter', letterSpacing: '0px',
            set font(v: string) { fonts.push(v) }, get font() { return fonts.at(-1) ?? '' },
            save() { log.push('save') }, restore() { log.push('restore') }, setTransform() {},
            transform(...a: number[]) { log.push(`transform:${a.map((n) => +n.toFixed(4)).join(',')}`) },
            measureText: () => ({ width: 10, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 0 }),
            fillText() { log.push('fillText') }, fillRect() { log.push('fillRect') }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, fill() {}, stroke() {}, strokeRect() {}, drawImage() {},
        }
        return { ctx: ctx as unknown as OffscreenCanvasRenderingContext2D, fonts, log }
    }

    it('should lean a shape -10° about its pivot row and restore afterwards', () => {
        const r = recorder()
        paintOps(r.ctx, [{ kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#fff', skew: 100 }], { logo: null })
        // x' = x - tan(10°) × (y - 100): shear -0.1763, shift +17.63
        expect(r.log).toContain('transform:1,0,-0.1763,1,17.6327,0')
        expect(r.log.indexOf('fillRect')).toBeGreaterThan(r.log.findIndex((l) => l.startsWith('transform')))
        expect(r.log.at(-1)).toBe('restore')
    })

    it('should not lean shapes without a pivot', () => {
        const r = recorder()
        paintOps(r.ctx, [{ kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#fff' }], { logo: null })
        expect(r.log.some((l) => l.startsWith('transform'))).toBe(false)
    })

    it('should draw each text in its own static brand font', () => {
        const r = recorder()
        for (const voice of ['stadium', 'heading', 'scoreboard', 'shirt', 'mono'] as const) {
            paintOps(r.ctx, [{ kind: 'text', text: 'A', x: 0, y: 0, size: 50, color: '#fff', voice, align: 'left', baseline: 'alphabetic' }], { logo: null })
        }
        expect(r.fonts.filter((f) => f.startsWith('50px'))).toEqual(expect.arrayContaining([
            expect.stringContaining('"Shooot Stadium"'), expect.stringContaining('"Shooot Heading"'), expect.stringContaining('"Shooot Scoreboard"'),
            expect.stringContaining('"Shooot Shirt"'), expect.stringContaining('"Shooot Mono"'),
        ]))
    })

    it('should draw pitch markings', () => {
        const r = recorder()
        paintOps(r.ctx, [{ kind: 'pitch' }], { logo: null })
        expect(r.log).toContain('restore')
    })
})
