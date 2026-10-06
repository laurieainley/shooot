import { describe, it, expect } from 'vitest'
import { NO_TAPS, isDoubleTap, resolveTap } from './tap'

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

describe('resolveTap', () => {
    const at = (time: number, zone: 'left' | 'centre' | 'right') => ({ time, zone })

    it('should toggle a centre tap at once and a side tap after the double-tap window', () => {
        expect(resolveTap(NO_TAPS, at(1000, 'centre')).action).toBe('toggle')
        expect(resolveTap(NO_TAPS, at(1000, 'left')).action).toBe('toggle-later')
    })

    it('should seek on a double tap on a side', () => {
        const first = resolveTap(NO_TAPS, at(1000, 'right'))
        expect(resolveTap(first.memory, at(1200, 'right')).action).toBe('seek')
    })

    it('should ignore a third tap within 500 ms of the double tap', () => {
        const t1 = resolveTap(NO_TAPS, at(1000, 'left'))
        const t2 = resolveTap(t1.memory, at(1150, 'left'))
        expect(t2.action).toBe('seek')
        expect(resolveTap(t2.memory, at(1400, 'left')).action).toBe('ignore')
        // even a centre tap, which would normally toggle at once
        expect(resolveTap(t2.memory, at(1400, 'centre')).action).toBe('ignore')
    })

    it('should keep ignoring a rapid run of taps until they pause', () => {
        let m = resolveTap(resolveTap(NO_TAPS, at(0, 'left')).memory, at(100, 'left')).memory
        const t3 = resolveTap(m, at(400, 'left')); m = t3.memory
        expect(t3.action).toBe('ignore')
        expect(resolveTap(m, at(800, 'left')).action).toBe('ignore')
        expect(resolveTap(m, at(1301, 'left')).action).toBe('toggle-later')
    })

    it('should treat a single tap after the 500 ms quiet period as a normal tap', () => {
        const t2 = resolveTap(resolveTap(NO_TAPS, at(0, 'left')).memory, at(100, 'left'))
        expect(t2.action).toBe('seek')
        expect(resolveTap(t2.memory, at(600, 'centre')).action).toBe('toggle')
        expect(resolveTap(t2.memory, at(700, 'right')).action).toBe('toggle-later')
    })

    it('should not pair the tap that follows a double tap with a fresh double tap on the same side', () => {
        const t2 = resolveTap(resolveTap(NO_TAPS, at(0, 'left')).memory, at(100, 'left'))
        const t3 = resolveTap(t2.memory, at(700, 'left'))
        expect(t3.action).toBe('toggle-later')
        expect(resolveTap(t3.memory, at(900, 'left')).action).toBe('seek')
    })
})
