import { describe, it, expect } from 'vitest'
import { nextZoom, clampPan, settleZoom, clampZoom, MAX_ZOOM, ZOOM_LEVELS } from './zoom'

describe('nextZoom', () => {
    it('should cycle 1 → 1.5 → 2 → 3 → 4 → 1', () => {
        expect(ZOOM_LEVELS).toEqual([1, 1.5, 2, 3, 4])
        expect(nextZoom(1)).toBe(1.5)
        expect(nextZoom(1.5)).toBe(2)
        expect(nextZoom(2)).toBe(3)
        expect(nextZoom(3)).toBe(4)
        expect(nextZoom(4)).toBe(1)
    })

    it('should go to the next level up from a pinched zoom between levels', () => {
        expect(nextZoom(1.7)).toBe(2)
        expect(nextZoom(3.6)).toBe(4)
    })
})

describe('clampPan', () => {
    it('should allow no pan at 1×', () => {
        expect(clampPan(1, { x: 50, y: -20 }, { width: 1000, height: 500 })).toEqual({ x: 0, y: 0 })
    })
    it('should keep the zoomed frame covering the viewport', () => {
        // at 2× the frame is 2000×1000; max offset is half the overflow: 500×250
        expect(clampPan(2, { x: 900, y: -900 }, { width: 1000, height: 500 })).toEqual({ x: 500, y: -250 })
        expect(clampPan(2, { x: 100, y: 50 }, { width: 1000, height: 500 })).toEqual({ x: 100, y: 50 })
    })
    it('should allow more pan at 4×', () => {
        expect(clampPan(4, { x: 2000, y: 2000 }, { width: 1000, height: 500 })).toEqual({ x: 1500, y: 750 })
    })
})

describe('clampZoom', () => {
    it('should keep a pinch between 1× and the 4× maximum', () => {
        expect(MAX_ZOOM).toBe(4)
        expect(clampZoom(0.5)).toBe(1)
        expect(clampZoom(2.7)).toBe(2.7)
        expect(clampZoom(6)).toBe(4)
    })
})

describe('settleZoom', () => {
    it('should keep a released pinch where it is (continuous), within 1–4', () => {
        expect(settleZoom(1.8)).toBe(1.8)
        expect(settleZoom(3.3)).toBe(3.3)
        expect(settleZoom(5)).toBe(4)
    })

    it('should snap back home when released just above 1×', () => {
        expect(settleZoom(1.08)).toBe(1)
        expect(settleZoom(0.5)).toBe(1)
    })
})

import { zoomTowards, dragPan, classifyPointer, wheelZoomFactor, CLICK_MAX_DISTANCE_PX, CLICK_MAX_DURATION_MS } from './zoom'

const VP = { width: 1000, height: 600 }

describe('zoomTowards', () => {
    it('should keep the point under the cursor fixed', () => {
        const cursor = { x: 400, y: 250 } // offset from the viewport centre
        const before = { zoom: 2, pan: { x: -50, y: 30 } }
        const r = zoomTowards(before.zoom, before.pan, 3, cursor, VP)
        const under = (z: number, p: { x: number; y: number }): { x: number; y: number } => ({ x: (cursor.x - p.x) / z, y: (cursor.y - p.y) / z })
        expect(under(r.zoom, r.pan).x).toBeCloseTo(under(2, before.pan).x)
        expect(under(r.zoom, r.pan).y).toBeCloseTo(under(2, before.pan).y)
    })
    it('should zoom from 1x towards a corner, panning the opposite way', () => {
        const r = zoomTowards(1, { x: 0, y: 0 }, 2, { x: 500, y: 300 }, VP)
        expect(r.zoom).toBe(2)
        expect(r.pan).toEqual({ x: -500, y: -300 })
    })
    it('should clamp the zoom to 1..4 and the pan to the picture', () => {
        expect(zoomTowards(3, { x: 0, y: 0 }, 9, { x: 0, y: 0 }, VP).zoom).toBe(4)
        const r = zoomTowards(2, { x: 500, y: 0 }, 1.5, { x: 0, y: 0 }, VP)
        expect(r.pan.x).toBe(250)
    })
    it('should return home when zooming out to 1x', () => {
        expect(zoomTowards(2, { x: 100, y: 50 }, 1, { x: 200, y: 0 }, VP)).toEqual({ zoom: 1, pan: { x: 0, y: 0 } })
    })
})

describe('dragPan', () => {
    it('should add the drag delta and clamp', () => {
        expect(dragPan(2, { x: 0, y: 0 }, 30, -20, VP)).toEqual({ x: 30, y: -20 })
        expect(dragPan(2, { x: 490, y: 0 }, 100, 0, VP)).toEqual({ x: 500, y: 0 })
    })
    it('should not pan at 1x', () => {
        expect(dragPan(1, { x: 0, y: 0 }, 30, 30, VP)).toEqual({ x: 0, y: 0 })
    })
})

describe('classifyPointer', () => {
    it('should call a short still press a click', () => {
        expect(classifyPointer(2, 120)).toBe('click')
    })
    it('should call movement of 5 px or more a drag', () => {
        expect(CLICK_MAX_DISTANCE_PX).toBe(5)
        expect(classifyPointer(5, 100)).toBe('drag')
        expect(classifyPointer(4.9, 100)).toBe('click')
    })
    it('should call a long press a drag (not a click)', () => {
        expect(CLICK_MAX_DURATION_MS).toBe(300)
        expect(classifyPointer(0, 300)).toBe('drag')
    })
})

describe('wheelZoomFactor', () => {
    it('should zoom in for negative deltaY and out for positive', () => {
        expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
        expect(wheelZoomFactor(100)).toBeLessThan(1)
        expect(wheelZoomFactor(0)).toBe(1)
    })
    it('should be reversible', () => {
        expect(wheelZoomFactor(40) * wheelZoomFactor(-40)).toBeCloseTo(1)
    })
})
