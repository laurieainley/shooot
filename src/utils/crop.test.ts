import { describe, it, expect } from 'vitest'
import { clampRect, cropPixels, cropTransform, defaultGoalAreas, isSoft, moveRect, resizeFromCorner, normaliseAreas, migrateReplayCrop, swapGoalAreas, resizeRect, zoomOf, zoomRect, MIN_BOX_W } from './crop'

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

describe('resizeFromCorner', () => {
    const r = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }
    it('should keep the top-left corner fixed when dragging bottom-right', () => {
        const n = resizeFromCorner(r, 'br', 0.1, 0.1)
        expect(n.x).toBeCloseTo(0.3); expect(n.y).toBeCloseTo(0.3); expect(n.w).toBeCloseTo(0.5); expect(n.h).toBeCloseTo(0.5)
    })
    it('should keep the top-right corner fixed when dragging bottom-left', () => {
        const n = resizeFromCorner(r, 'bl', -0.1, 0.1)
        expect(n.w).toBeCloseTo(0.5)
        expect(n.x + n.w).toBeCloseTo(0.7); expect(n.y).toBeCloseTo(0.3)
    })
    it('should keep the bottom-left corner fixed when dragging top-right', () => {
        const n = resizeFromCorner(r, 'tr', 0.1, -0.1)
        expect(n.w).toBeCloseTo(0.5)
        expect(n.x).toBeCloseTo(0.3); expect(n.y + n.h).toBeCloseTo(0.7)
    })
    it('should keep the bottom-right corner fixed when dragging top-left', () => {
        const n = resizeFromCorner(r, 'tl', -0.1, -0.1)
        expect(n.w).toBeCloseTo(0.5)
        expect(n.x + n.w).toBeCloseTo(0.7); expect(n.y + n.h).toBeCloseTo(0.7)
    })
    it('should shrink towards the opposite corner and stop at the minimum size', () => {
        const n = resizeFromCorner(r, 'tl', 0.5, 0.5)
        expect(n.w).toBeCloseTo(MIN_BOX_W)
        expect(n.x + n.w).toBeCloseTo(0.7); expect(n.y + n.h).toBeCloseTo(0.7)
    })
    it('should stop at the frame edge for every corner, leaving the anchor fixed', () => {
        const br = resizeFromCorner(r, 'br', 5, 5)
        expect(br.x).toBeCloseTo(0.3); expect(br.x + br.w).toBeCloseTo(1); expect(br.y + br.h).toBeLessThanOrEqual(1 + 1e-9)
        const tl = resizeFromCorner(r, 'tl', -5, -5)
        expect(tl.x + tl.w).toBeCloseTo(0.7); expect(tl.x).toBeGreaterThanOrEqual(-1e-9); expect(tl.y).toBeGreaterThanOrEqual(-1e-9)
        const tr = resizeFromCorner(r, 'tr', 5, -5)
        expect(tr.x).toBeCloseTo(0.3); expect(tr.y + tr.h).toBeCloseTo(0.7); expect(tr.y).toBeGreaterThanOrEqual(-1e-9); expect(tr.x + tr.w).toBeLessThanOrEqual(1 + 1e-9)
        const bl = resizeFromCorner(r, 'bl', -5, 5)
        expect(bl.x + bl.w).toBeCloseTo(0.7); expect(bl.y).toBeCloseTo(0.3); expect(bl.x).toBeGreaterThanOrEqual(-1e-9); expect(bl.y + bl.h).toBeLessThanOrEqual(1 + 1e-9)
    })
    it('should keep the aspect lock', () => {
        const n = resizeFromCorner(r, 'bl', -0.07, 0.02)
        expect(n.h).toBeCloseTo(n.w)
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
        expect(a.team1!.w).toBeCloseTo(0.4)
        expect(a.team1!.x + a.team1!.w / 2).toBeLessThan(0.5)
        expect(a.team2!.x + a.team2!.w / 2).toBeGreaterThan(0.5)
        for (const r of [a.team1!, a.team2!]) expect(clampRect(r)).toEqual(r)
    })
})

describe('swapGoalAreas', () => {
    it('should exchange which box belongs to which team', () => {
        const a = defaultGoalAreas()
        expect(swapGoalAreas(a)).toEqual({ team1: a.team2, team2: a.team1 })
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
    it('should accept team areas and clamp them', () => {
        const a = normaliseAreas({ team1: { x: 0.1, y: 0.1, w: 0.3, h: 0.9 }, team2: { x: 0.6, y: 0.2, w: 0.4, h: 0.4 } })
        expect(a?.team1?.h).toBe(0.3)
        expect(a?.team2?.w).toBe(0.4)
    })
    it('should accept a single area', () => {
        const a = normaliseAreas({ team2: { x: 0.6, y: 0.2, w: 0.4, h: 0.4 } })
        expect(a?.team1).toBeUndefined()
        expect(a?.team2).toBeDefined()
    })
    it('should migrate left / right: the box the first team attacked becomes the second team\'s goal', () => {
        const left = { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }
        const right = { x: 0.56, y: 0.3, w: 0.4, h: 0.4 }
        expect(normaliseAreas({ left, right }, true)).toEqual({ team1: right, team2: left })
        expect(normaliseAreas({ left, right }, false)).toEqual({ team1: left, team2: right })
        expect(normaliseAreas({ left, right })).toEqual({ team1: right, team2: left })
    })
    it('should reject anything else', () => {
        expect(normaliseAreas(null)).toBeNull()
        expect(normaliseAreas({ left: 1 })).toBeNull()
        expect(normaliseAreas({ team1: 1 })).toBeNull()
        expect(normaliseAreas('x')).toBeNull()
    })
})

describe('migrateReplayCrop', () => {
    it('should turn left / right into the team whose goal it was', () => {
        expect(migrateReplayCrop('left', true)).toBe('team2')
        expect(migrateReplayCrop('right', true)).toBe('team1')
        expect(migrateReplayCrop('left', false)).toBe('team1')
        expect(migrateReplayCrop('right', false)).toBe('team2')
    })
    it('should keep everything else as it is', () => {
        expect(migrateReplayCrop('full', true)).toBe('full')
        expect(migrateReplayCrop('team1', true)).toBe('team1')
        expect(migrateReplayCrop(undefined, true)).toBeUndefined()
        const box = { x: 0, y: 0, w: 0.5, h: 0.5 }
        expect(migrateReplayCrop(box, true)).toBe(box)
        expect(migrateReplayCrop('nonsense', true)).toBeUndefined()
    })
})
