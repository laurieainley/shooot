import { describe, it, expect } from 'vitest'
import { clipPartSeconds, replayPartAfter } from './captionJoin'

describe('clipPartSeconds', () => {
    it('should keep the caption up to the real end of its clip (whole GOPs)', () => {
        expect(clipPartSeconds(21, 3, 25, 5)).toBe(4)
    })

    it('should never be shorter than planned, nor longer than the caption', () => {
        expect(clipPartSeconds(21, 3, 23, 5)).toBe(3)
        expect(clipPartSeconds(21, 3, 40, 5)).toBe(5)
    })
})

describe('replayPartAfter', () => {
    it('should carry the caption on from where the clip part ended, on the caption clock', () => {
        // planned offset 3, shown 4 -> the replay (rate 2: slowed 2x) is 1 clock second further on
        const r = replayPartAfter({ shownSec: 4, plannedOffsetSec: 3, totalSec: 5, rate: 2, replaySec: 10 })
        expect(r).toEqual({ paintShiftSec: 0.5, durationSec: 0.5 })
    })

    it('should end with the caption or the replay, whichever is first', () => {
        expect(replayPartAfter({ shownSec: 3, plannedOffsetSec: 3, totalSec: 5, rate: 2, replaySec: 0.25 })?.durationSec).toBe(0.25)
    })

    it('should be dropped when the clip part already filled the caption', () => {
        expect(replayPartAfter({ shownSec: 5, plannedOffsetSec: 3, totalSec: 5, rate: 2, replaySec: 10 })).toBeNull()
    })
})
