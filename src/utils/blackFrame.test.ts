import { describe, it, expect } from 'vitest'
import { isNearBlack } from './blackFrame'

const solid = (r: number, g: number, b: number, pixels = 100): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(pixels * 4)
    for (let i = 0; i < pixels; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255 }
    return d
}

describe('isNearBlack', () => {
    it('should say a fully black frame is black', () => {
        expect(isNearBlack(solid(0, 0, 0))).toBe(true)
    })
    it('should say a nearly black frame (compression noise) is black', () => {
        expect(isNearBlack(solid(6, 5, 7))).toBe(true)
    })
    it('should say a dark pitch at dusk is not black', () => {
        expect(isNearBlack(solid(30, 50, 30))).toBe(false)
    })
    it('should say a bright frame is not black', () => {
        expect(isNearBlack(solid(200, 200, 200))).toBe(false)
    })
    it('should not call a frame black when a small part of it is bright', () => {
        const d = solid(0, 0, 0, 100)
        for (let i = 0; i < 10; i++) { d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255 }
        expect(isNearBlack(d)).toBe(false)
    })
    it('should treat an empty sample as black (nothing was drawn)', () => {
        expect(isNearBlack(new Uint8ClampedArray(0))).toBe(true)
    })
})
