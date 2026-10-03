import { describe, it, expect } from 'vitest'
import { nextZoom, clampPan, ZOOM_LEVELS } from './zoom'

describe('nextZoom', () => {
    it('should cycle 1 → 1.5 → 2 → 1', () => {
        expect(ZOOM_LEVELS).toEqual([1, 1.5, 2])
        expect(nextZoom(1)).toBe(1.5)
        expect(nextZoom(1.5)).toBe(2)
        expect(nextZoom(2)).toBe(1)
        expect(nextZoom(1.7)).toBe(1)
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
})
