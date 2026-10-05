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
