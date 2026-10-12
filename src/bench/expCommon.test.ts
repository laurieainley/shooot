import { describe, expect, it } from 'vitest'
import { hash64, meanAbsDiff, overlapOf } from './expCommon'

describe('bench experiment helpers', () => {
    it('should hash equal inputs equally and different inputs differently', () => {
        expect(hash64('abc')).toBe(hash64('abc'))
        expect(hash64('abc')).not.toBe(hash64('abd'))
        expect(hash64('')).toHaveLength(16)
    })
    it('should report whether units ran at the same time', () => {
        expect(overlapOf([])).toEqual({ maxConcurrent: 0, overlapFactor: 0 })
        expect(overlapOf([{ startMs: 0, endMs: 100 }, { startMs: 100, endMs: 200 }])).toEqual({ maxConcurrent: 1, overlapFactor: 1 })
        expect(overlapOf([{ startMs: 0, endMs: 100 }, { startMs: 0, endMs: 100 }, { startMs: 100, endMs: 200 }])).toEqual({ maxConcurrent: 2, overlapFactor: 1.5 })
    })
    it('should measure the mean absolute difference over a region', () => {
        const a = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]) } as ImageData
        const b = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]) } as ImageData
        expect(meanAbsDiff(a, b)).toBe(5)
        expect(meanAbsDiff(a, b, { x: 0, y: 0, w: 1, h: 1 })).toBe(0)
    })
})
