import { describe, it, expect } from 'vitest'
import type { GoalMarks } from '../types'
import { MIN_BOX_W } from './crop'
import {
    clampViewPan, contentSize, cropImageStyle, guessNextPoint, mapTapToBox, panBox, panToCentre, pinchBox, stepBox, thumbnailTimes, viewToFrame, zoomViewAt,
} from './goalSetup'

const VP = { width: 400, height: 600 }
const A = 16 / 9

describe('contentSize', () => {
    it('should letterbox a wide picture in a tall viewport', () => {
        const c = contentSize(VP, A)
        expect(c.w).toBeCloseTo(400)
        expect(c.h).toBeCloseTo(225)
    })
    it('should pillarbox when the viewport is wider than the picture', () => {
        const c = contentSize({ width: 1000, height: 300 }, A)
        expect(c.h).toBeCloseTo(300)
        expect(c.w).toBeCloseTo(533.33, 1)
    })
})

describe('viewToFrame', () => {
    it('should give the frame centre for an unzoomed, unpanned view', () => {
        expect(viewToFrame({ zoom: 1, pan: { x: 0, y: 0 } }, VP, A)).toEqual({ x: 0.5, y: 0.5 })
    })
    it('should follow the pan: moving the picture left shows points further right under the crosshair', () => {
        const p = viewToFrame({ zoom: 2, pan: { x: -200, y: 0 } }, VP, A)
        // offset from centre in picture px = 200 / 2 = 100 of 400 wide
        expect(p.x).toBeCloseTo(0.75)
        expect(p.y).toBeCloseTo(0.5)
    })
    it('should account for zoom on the vertical axis and the aspect ratio', () => {
        const p = viewToFrame({ zoom: 3, pan: { x: 0, y: 225 } }, VP, A)
        // y offset = -225/3 = -75 px of 225 high → 0.5 - 1/3
        expect(p.y).toBeCloseTo(0.5 - 75 / 225)
    })
    it('should measure a point away from the crosshair', () => {
        const p = viewToFrame({ zoom: 2, pan: { x: 0, y: 0 } }, VP, A, { x: 100, y: 0 })
        expect(p.x).toBeCloseTo(0.5 + 50 / 400)
    })
    it('should clamp to the frame', () => {
        expect(viewToFrame({ zoom: 1, pan: { x: -5000, y: 5000 } }, VP, A)).toEqual({ x: 1, y: 0 })
    })
})

describe('panToCentre', () => {
    it('should round-trip with viewToFrame at several zooms and aspects', () => {
        for (const zoom of [1, 2, 3, 7]) {
            for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
                const want = { x: 0.31, y: 0.62 }
                const pan = panToCentre(want, zoom, VP, aspect)
                const got = viewToFrame({ zoom, pan }, VP, aspect)
                expect(got.x).toBeCloseTo(want.x, 6)
                expect(got.y).toBeCloseTo(want.y, 6)
            }
        }
    })
    it('should reach the frame edges even when the picture is smaller than the view', () => {
        const pan = panToCentre({ x: 0, y: 1 }, 3, VP, A)
        const got = viewToFrame({ zoom: 3, pan }, VP, A)
        expect(got).toEqual({ x: 0, y: 1 })
    })
})

describe('clampViewPan', () => {
    it('should stop the picture edge at the crosshair', () => {
        const c = contentSize(VP, A)
        expect(clampViewPan(2, { x: 9999, y: -9999 }, VP, A)).toEqual({ x: (2 * c.w) / 2, y: -(2 * c.h) / 2 })
    })
})

describe('zoomViewAt', () => {
    it('should keep the point under the cursor fixed', () => {
        const view = { zoom: 2, pan: { x: -50, y: 20 } }
        const cursor = { x: 80, y: -30 }
        const before = viewToFrame(view, VP, A, cursor)
        const next = zoomViewAt(view, 1.5, cursor, VP, A, 15)
        expect(next.zoom).toBeCloseTo(3)
        const after = viewToFrame(next, VP, A, cursor)
        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
    })
    it('should clamp the zoom between 1 and the maximum', () => {
        const v = { zoom: 10, pan: { x: 0, y: 0 } }
        expect(zoomViewAt(v, 100, { x: 0, y: 0 }, VP, A, 15).zoom).toBe(15)
        expect(zoomViewAt(v, 0.001, { x: 0, y: 0 }, VP, A, 15).zoom).toBe(1)
    })
})

const goal: GoalMarks = {
    postL: { x: 0.1, y: 0.5 }, postR: { x: 0.2, y: 0.5 }, barL: { x: 0.1, y: 0.44 }, barR: { x: 0.2, y: 0.44 },
}

describe('guessNextPoint', () => {
    it('should start the first point of the first goal at the frame centre', () => {
        expect(guessNextPoint('postL', {}, null)).toEqual({ x: 0.5, y: 0.5 })
    })
    it('should start the second goal mirrored across the frame from the first', () => {
        const p = guessNextPoint('postL', {}, goal)
        expect(p.x).toBeCloseTo(1 - 0.2)
        expect(p.y).toBeCloseTo(0.5)
    })
    it('should look for the right post at the same height, one goal-width along', () => {
        const p = guessNextPoint('postR', { postL: { x: 0.3, y: 0.6 } }, goal)
        expect(p.y).toBeCloseTo(0.6)
        expect(p.x).toBeCloseTo(0.4) // other goal is 0.1 wide
    })
    it('should use a default width when there is no other goal', () => {
        const p = guessNextPoint('postR', { postL: { x: 0.3, y: 0.6 } }, null)
        expect(p.x).toBeGreaterThan(0.3)
        expect(p.y).toBeCloseTo(0.6)
    })
    it('should look for the tops above the bottoms by the usual post height', () => {
        const l = guessNextPoint('barL', { postL: { x: 0.7, y: 0.6 }, postR: { x: 0.8, y: 0.6 } }, goal)
        expect(l.x).toBeCloseTo(0.7)
        expect(l.y).toBeCloseTo(0.6 - 0.06) // other goal's post height
        const r = guessNextPoint('barR', { postL: { x: 0.7, y: 0.6 }, postR: { x: 0.8, y: 0.6 }, barL: { x: 0.7, y: 0.5 } }, goal)
        expect(r.x).toBeCloseTo(0.8)
        expect(r.y).toBeCloseTo(0.5) // matches the left post's height once that is placed
    })
    it('should keep guesses inside the frame', () => {
        const p = guessNextPoint('barL', { postL: { x: 0.5, y: 0.02 }, postR: { x: 0.6, y: 0.02 } }, null)
        expect(p.y).toBeGreaterThanOrEqual(0)
        const q = guessNextPoint('postR', { postL: { x: 0.98, y: 0.5 } }, null)
        expect(q.x).toBeLessThanOrEqual(1)
    })
    it('should look for the back corners behind the posts, lower in the picture', () => {
        const l = guessNextPoint('backL', goal, null)
        expect(l.y).toBeGreaterThan(0.5)
        const r = guessNextPoint('backR', goal, null)
        expect(r.y).toBeGreaterThan(0.5)
        expect(r.x).toBeGreaterThan(l.x)
    })
})

describe('stepBox', () => {
    const at = (zoom: number) => ({ x: 0.3, y: 0.3, w: 1 / zoom, h: 1 / zoom })
    it('should go up a tenth of zoom for Closer, about the same centre', () => {
        const r = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } // 2.0x
        const c = stepBox(r, 'closer')
        expect(1 / c.w).toBeCloseTo(2.1)
        expect(c.x + c.w / 2).toBeCloseTo(0.5)
        expect(c.y + c.h / 2).toBeCloseTo(0.5)
        expect(c.h).toBeCloseTo(c.w)
    })
    it('should go down a tenth for Wider, and walk 1.0, 1.1, 1.2', () => {
        expect(1 / stepBox({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 'wider').w).toBeCloseTo(1.9)
        const one = { x: 0, y: 0, w: 1, h: 1 }
        const a = stepBox(one, 'closer')
        expect(1 / a.w).toBeCloseTo(1.1)
        expect(1 / stepBox(a, 'closer').w).toBeCloseTo(1.2)
    })
    it('should land on a whole tenth from an in-between zoom', () => {
        expect(1 / stepBox(at(1.25), 'closer').w).toBeCloseTo(1.3)
        expect(1 / stepBox(at(1.25), 'wider').w).toBeCloseTo(1.2)
    })
    it('should stop at the smallest and the largest box', () => {
        expect(stepBox({ x: 0.4, y: 0.4, w: MIN_BOX_W, h: MIN_BOX_W }, 'closer').w).toBe(MIN_BOX_W)
        expect(stepBox({ x: 0, y: 0, w: 1, h: 1 }, 'wider').w).toBe(1)
    })
    it('should slide a widened box back inside the frame', () => {
        const w = stepBox({ x: 0.6, y: 0.6, w: 0.4, h: 0.4 }, 'wider')
        expect(w.x + w.w).toBeLessThanOrEqual(1 + 1e-9)
        expect(w.y + w.h).toBeLessThanOrEqual(1 + 1e-9)
    })
})

describe('mapTapToBox', () => {
    it('should centre the box on the tapped point', () => {
        const b = mapTapToBox({ x: 0, y: 0, w: 0.4, h: 0.4 }, { x: 0.5, y: 0.5 })
        expect(b.x).toBeCloseTo(0.3)
        expect(b.y).toBeCloseTo(0.3)
        expect(b.w).toBe(0.4)
    })
    it('should keep the box inside the frame near the edges', () => {
        const b = mapTapToBox({ x: 0, y: 0, w: 0.4, h: 0.4 }, { x: 0.99, y: 0.01 })
        expect(b.x).toBeCloseTo(0.6)
        expect(b.y).toBe(0)
    })
})

describe('panBox', () => {
    it('should move the box opposite to a drag, in proportion to what is on show', () => {
        const b = panBox({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, 100, 0, { width: 400, height: 225 })
        // dragging the picture right by a quarter of the view shows what is a quarter of a box to the left
        expect(b.x).toBeCloseTo(0.3 - 0.1)
        expect(b.y).toBeCloseTo(0.3)
    })
    it('should stay inside the frame', () => {
        const b = panBox({ x: 0.05, y: 0.3, w: 0.4, h: 0.4 }, 4000, -4000, { width: 400, height: 225 })
        expect(b.x).toBe(0)
        expect(b.y).toBeCloseTo(0.6)
    })
})

describe('pinchBox', () => {
    it('should zoom in when the fingers spread, about the box centre', () => {
        const b = pinchBox({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, 2)
        expect(b.w).toBeCloseTo(0.2)
        expect(b.x + b.w / 2).toBeCloseTo(0.5)
    })
    it('should clamp to the allowed sizes', () => {
        expect(pinchBox({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, 100).w).toBe(MIN_BOX_W)
        expect(pinchBox({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, 0.01).w).toBe(1)
    })
})

describe('cropImageStyle', () => {
    it('should size and offset the full picture so the box fills the view', () => {
        expect(cropImageStyle({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 })).toEqual({ width: '200%', height: '200%', left: '-50%', top: '-100%' })
    })
    it('should be the identity for the whole frame', () => {
        expect(cropImageStyle({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ width: '100%', height: '100%', left: '0%', top: '0%' })
    })
})

describe('thumbnailTimes', () => {
    it('should spread six moments across the video, skipping the first and last 5%', () => {
        const t = thumbnailTimes(1000)
        expect(t).toHaveLength(6)
        expect(t[0]).toBeCloseTo(50)
        expect(t[5]).toBeCloseTo(950)
        expect(t[1] - t[0]).toBeCloseTo(t[2] - t[1])
    })
    it('should give nothing for an unknown duration', () => {
        expect(thumbnailTimes(0)).toEqual([])
    })
})
