import { describe, expect, it } from 'vitest'
import { confirmedCopy, deletedCopy, discardedCopy, eventGlobalSec, markerSetCopy, matchClock, taggedCopy } from './toastCopy'

describe('toastCopy', () => {
    it('should word each confirmation exactly', () => {
        expect(confirmedCopy('goal', 'Whites', '12:34')).toBe('Goal · Whites confirmed at 12:34')
        expect(confirmedCopy('goal', 'Whites', '12:34', 'Sam')).toBe('Goal · Whites · Sam confirmed at 12:34')
        expect(confirmedCopy('save', undefined, '01:02')).toBe('Save confirmed at 01:02')
        expect(discardedCopy('12:34')).toBe('Discarded 12:34')
        expect(taggedCopy('own_goal', 'Colours', '05:00')).toBe('Own goal · Colours tagged at 05:00')
        expect(deletedCopy('foul', '03:10')).toBe('Foul at 03:10 deleted')
        expect(markerSetCopy('half_time', '25:00')).toBe('Half time set at 25:00')
    })
    it('should use the match clock after Kick off, never negative', () => {
        expect(matchClock(754, 120, false)).toBe('10:34')
        expect(matchClock(50, 120, false)).toBe('00:00')
    })
    it('should place an event on the whole timeline', () => {
        expect(eventGlobalSec({ matchTimeSec: 30, sourceFileIndex: 1 }, [0, 600])).toBe(630)
        expect(eventGlobalSec({ matchTimeSec: 30 }, [100])).toBe(130)
    })
})
