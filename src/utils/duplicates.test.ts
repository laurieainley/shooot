import { describe, it, expect } from 'vitest'
import type { MatchEvent } from '../types'
import { nearbyMark } from './duplicates'

const ev = (id: string, t: number, file = 0, type: MatchEvent['type'] = 'goal'): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: file, type })

describe('nearbyMark', () => {
    it('should find another mark within 3 s in the same file, with the signed gap', () => {
        const events = [ev('a', 100), ev('b', 102)]
        expect(nearbyMark(events, 'b')).toEqual({ event: events[0], deltaSec: -2 })
        expect(nearbyMark(events, 'a')).toEqual({ event: events[1], deltaSec: 2 })
    })

    it('should pick the closest when several are near', () => {
        const events = [ev('a', 97), ev('b', 101), ev('c', 100)]
        expect(nearbyMark(events, 'c')?.event.id).toBe('b')
    })

    it('should ignore marks further apart or in another file', () => {
        expect(nearbyMark([ev('a', 100), ev('b', 104)], 'b')).toBeNull()
        expect(nearbyMark([ev('a', 100, 0), ev('b', 100, 1)], 'b')).toBeNull()
    })

    it('should return null for an unknown id', () => {
        expect(nearbyMark([ev('a', 100)], 'zz')).toBeNull()
    })
})
