import { describe, it, expect } from 'vitest'
import { clampRect, cropPixels, cropTransform, defaultGoalAreas, isSoft, moveRect, normaliseAreas, resizeRect, zoomOf, zoomRect, MIN_BOX_W } from './crop'

describe('clampRect', () => {
    it('should lock the aspect: the box is as tall as it is wide in frame fractions', () => {
        expect(clampRect({ x: 0.1, y: 0.1, w: 0.4, h: 0.9 })).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 })
    })
    it('should keep the box inside the frame', () => {
        const r = clampRect({ x: 0.9, y: -0.2, w: 0.4, h: 0.4 })
        expect(r.x).toBeCloseTo(0.6)
        expect(r.y).toBe(0)
    })
    it('should limit the size to the frame and a minimum', () => {
        expect(clampRect({ x: 0, y: 0, w: 3, h: 3 }).w).toBe(1)
        expect(clampRect({ x: 0, y: 0, w: 0.01, h: 0.01 }).w).toBe(MIN_BOX_W)
    })
    it('should repair non-finite numbers', () => {
        const r = clampRect({ x: NaN, y: 0.2, w: Infinity, h: 0 })
        expect(Number.isFinite(r.x) && Number.isFinite(r.w)).toBe(true)
    })
})

describe('moveRect', () => {
    it('should move by a fraction of the frame and stay inside it', () => {
        const m = moveRect({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, 0.1, 0.2)
        expect(m.x).toBeCloseTo(0.2)
        expect(m.y).toBeCloseTo(0.3)
        const r = moveRect({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, 0.5)
        expect(r.x).toBeCloseTo(0.6)
        expect(r.y).toBeCloseTo(0.6)
    })
})

describe('resizeRect', () => {
    it('should grow from the top-left corner (bottom-right handle) and stay locked', () => {
        const r = resizeRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.4)
        expect(r).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 })
    })
    it('should shift left or up when it would leave the frame', () => {
        const r = resizeRect({ x: 0.7, y: 0.7, w: 0.2, h: 0.2 }, 0.5)
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9)
    })
})

describe('zoomRect', () => {
    it('should scale the box around its centre: zoom is the reciprocal of the width', () => {
        const r = zoomRect({ x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, 2)
        expect(r.w).toBeCloseTo(0.5)
        expect(r.x + r.w / 2).toBeCloseTo(0.5)
        expect(r.y + r.h / 2).toBeCloseTo(0.4)
        expect(zoomOf(r)).toBeCloseTo(2)
    })
    it('should slide a box that would overhang back into the frame', () => {
        const r = zoomRect({ x: 0.6, y: 0.6, w: 0.4, h: 0.4 }, 1.2)
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
    })
    it('should be the whole frame at 1x', () => {
        expect(zoomRect({ x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    })
})

describe('isSoft', () => {
    it('should warn below 35 % of the frame width', () => {
        expect(isSoft({ x: 0, y: 0, w: 0.34, h: 0.34 })).toBe(true)
        expect(isSoft({ x: 0, y: 0, w: 0.4, h: 0.4 })).toBe(false)
    })
})

describe('defaultGoalAreas', () => {
    it('should put a 40 % box at each side, inside the frame', () => {
        const a = defaultGoalAreas()
        expect(a.left.w).toBeCloseTo(0.4)
        expect(a.left.x + a.left.w / 2).toBeLessThan(0.5)
        expect(a.right.x + a.right.w / 2).toBeGreaterThan(0.5)
        for (const r of [a.left, a.right]) expect(clampRect(r)).toEqual(r)
    })
})

describe('cropPixels', () => {
    it('should convert to pixels of the frame', () => {
        expect(cropPixels({ x: 0.5, y: 0.25, w: 0.25, h: 0.25 }, 1920, 1080)).toEqual({ sx: 960, sy: 270, sw: 480, sh: 270 })
    })
})

describe('cropTransform', () => {
    it('should be 1x without translation for the whole frame', () => {
        expect(cropTransform({ x: 0, y: 0, w: 1, h: 1 }, { width: 800, height: 450 })).toEqual({ zoom: 1, pan: { x: 0, y: 0 } })
    })
    it('should zoom by 1/w and bring the box centre to the middle of the view', () => {
        const t = cropTransform({ x: 0.5, y: 0.25, w: 0.25, h: 0.25 }, { width: 800, height: 450 })
        expect(t.zoom).toBeCloseTo(4)
        // centre of the box is at (0.625, 0.375): 0.125 right of and 0.125 above the middle
        expect(t.pan.x).toBeCloseTo(-0.125 * 800 * 4)
        expect(t.pan.y).toBeCloseTo(0.125 * 450 * 4)
    })
})

describe('normaliseAreas', () => {
    it('should accept valid areas and clamp them', () => {
        const a = normaliseAreas({ left: { x: 0.1, y: 0.1, w: 0.3, h: 0.9 }, right: { x: 0.6, y: 0.2, w: 0.4, h: 0.4 } })
        expect(a?.left.h).toBe(0.3)
    })
    it('should reject anything else', () => {
        expect(normaliseAreas(null)).toBeNull()
        expect(normaliseAreas({ left: 1 })).toBeNull()
        expect(normaliseAreas('x')).toBeNull()
    })
})
