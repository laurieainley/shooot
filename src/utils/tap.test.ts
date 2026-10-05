import { describe, it, expect } from 'vitest'
import { isDoubleTap } from './tap'

describe('isDoubleTap', () => {
    it('should pair two taps on the same side within the window', () => {
        expect(isDoubleTap({ time: 1000, zone: 'left' }, { time: 1250, zone: 'left' })).toBe(true)
        expect(isDoubleTap({ time: 1000, zone: 'right' }, { time: 1299, zone: 'right' })).toBe(true)
    })

    it('should not pair slow taps, taps on different sides, the centre or a first tap', () => {
        expect(isDoubleTap({ time: 1000, zone: 'left' }, { time: 1300, zone: 'left' })).toBe(false)
        expect(isDoubleTap({ time: 1000, zone: 'left' }, { time: 1100, zone: 'right' })).toBe(false)
        expect(isDoubleTap({ time: 1000, zone: 'centre' }, { time: 1100, zone: 'centre' })).toBe(false)
        expect(isDoubleTap(null, { time: 1100, zone: 'left' })).toBe(false)
    })
})
