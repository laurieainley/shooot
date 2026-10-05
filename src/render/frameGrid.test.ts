import { describe, it, expect } from 'vitest'
import { frameDuration, presentationRanks } from './frameGrid'

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

describe('presentationRanks', () => {
    it('should give each packet (decode order) its position in presentation order', () => {
        expect(presentationRanks([0, 0.1, 0.033, 0.066])).toEqual([0, 3, 1, 2])
    })
})
