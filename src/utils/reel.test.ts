import { describe, it, expect } from 'vitest'
import { reelSummary, formatReelLength, estimateReencode } from './reel'
import type { MatchEvent } from '../types'

const ev = (id: string, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })
const base = { cumulativeOffsets: [0], durationsSec: [600], matchStartSec: 0, adjustTimestampsByOffset: false, before: 10, after: 4, replay: { beforeSec: 3, afterSec: 1, speed: 0.5 } }

describe('reelSummary', () => {
    it('should be empty without events', () => {
        expect(reelSummary({ ...base, events: [] })).toEqual({ seconds: 0, clips: 0 })
    })

    it('should add the slowed replay length for events that want a replay', () => {
        expect(reelSummary({ ...base, events: [ev('a', 100)] })).toEqual({ seconds: 14 + 4 / 0.5, clips: 1 })
        expect(reelSummary({ ...base, events: [ev('h', 100, { type: 'highlight' })] })).toEqual({ seconds: 14, clips: 1 })
        expect(reelSummary({ ...base, events: [ev('h', 100, { type: 'highlight', replay: true })] })).toEqual({ seconds: 22, clips: 1 })
    })

    it('should count merged clips once and clamp windows to the file', () => {
        expect(reelSummary({ ...base, events: [ev('a', 100), ev('b', 105)] })).toEqual({ seconds: 19 + 16, clips: 1 })
        expect(reelSummary({ ...base, events: [ev('a', 5)] })).toEqual({ seconds: 9 + 8, clips: 1 })
    })

    it('should ignore unlinked events', () => {
        expect(reelSummary({ ...base, events: [ev('a', 100, { unlinked: true })] })).toEqual({ seconds: 0, clips: 0 })
    })
})

describe('formatReelLength', () => {
    it('should format as m:ss', () => {
        expect(formatReelLength(72)).toBe('1:12')
        expect(formatReelLength(5.4)).toBe('0:05')
        expect(formatReelLength(3725)).toBe('62:05')
    })
})

describe('estimateReencode', () => {
    it('should use the measured speed of this device when there is one, else a guess per device kind', () => {
        expect(estimateReencode(24, 0.5, false)).toBe('about 12 s')
        expect(estimateReencode(200, null, false)).toBe('about 2 min')
        expect(estimateReencode(100, null, true)).toBe('about 4 min')
    })
})
