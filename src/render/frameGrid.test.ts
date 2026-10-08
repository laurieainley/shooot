import { describe, it, expect } from 'vitest'
import { frameDuration, nominalFrameRate, presentationRanks } from './frameGrid'

describe('frameDuration', () => {
    it('should snap measured rates to broadcast rates', () => {
        expect(frameDuration(29.9701)).toBe(1001 / 30000)
        expect(frameDuration(59.94)).toBe(1001 / 60000)
        expect(frameDuration(25.001)).toBe(1 / 25)
        expect(frameDuration(119.88)).toBe(1001 / 120000)
    })

    it('should keep unusual rates and fall back to 30 fps for nonsense', () => {
        expect(frameDuration(15)).toBeCloseTo(1 / 15)
        expect(frameDuration(0)).toBe(1001 / 30000)
        expect(frameDuration(Number.NaN)).toBe(1001 / 30000)
    })
})

describe('frameDuration (exact and NTSC rates)', () => {
    it('should tell exact integer rates from their NTSC neighbours', () => {
        expect(frameDuration(30)).toBe(1 / 30)
        expect(frameDuration(30.002)).toBe(1 / 30)
        expect(frameDuration(60)).toBe(1 / 60)
        expect(frameDuration(24)).toBe(1 / 24)
        expect(frameDuration(120)).toBe(1 / 120)
        expect(frameDuration(23.976)).toBe(1001 / 24000)
        expect(frameDuration(29.97)).toBe(1001 / 30000)
    })
})

describe('frameDuration (variable frame rate)', () => {
    it('should use the measured average of phone footage that is not on a standard rate', () => {
        expect(frameDuration(27.4)).toBeCloseTo(1 / 27.4, 6)
        expect(frameDuration(23.1)).toBeCloseTo(1 / 23.1, 6)
    })

    it('should keep a card frame rate an encoder can take for extreme averages', () => {
        expect(frameDuration(0.2)).toBeCloseTo(1 / 5, 6)
        expect(frameDuration(900)).toBeCloseTo(1 / 240, 4)
    })
})

describe('presentationRanks', () => {
    it('should give each packet (decode order) its position in presentation order', () => {
        expect(presentationRanks([0, 0.1, 0.033, 0.066])).toEqual([0, 3, 1, 2])
    })
})

describe('nominalFrameRate', () => {
    const at = (rate: number, n: number): number[] => Array.from({ length: n }, (_, i) => i / rate)

    it('should read a constant frame rate', () => {
        expect(nominalFrameRate(at(30, 90))).toBeCloseTo(30, 6)
    })

    it('should ignore the order the timestamps come in (decode order with B-frames)', () => {
        expect(nominalFrameRate([0, 0.1, 0.033, 0.066].map((t) => t * 1))).toBeCloseTo(1 / 0.0333, 0)
    })

    it('should stay on the usual rate when a variable-rate clip drops frames', () => {
        const ts = at(30, 90).filter((_, i) => i % 7 !== 3)
        expect(nominalFrameRate(ts)).toBeCloseTo(30, 6)
    })

    it('should return 0 when there is nothing to measure', () => {
        expect(nominalFrameRate([])).toBe(0)
        expect(nominalFrameRate([1])).toBe(0)
        expect(nominalFrameRate([2, 2])).toBe(0)
    })
})
