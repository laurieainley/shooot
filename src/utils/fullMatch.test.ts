import { describe, it, expect } from 'vitest'
import { estimateBytes, formatBytes, fullMatchCuts, fullMatchSpan, recordingGaps } from './fullMatch'
import type { MatchEvent } from '../types'

describe('fullMatchCuts', () => {
    it('should run from kick-off in the first file, through whole middle files, to the final whistle in the last', () => {
        expect(fullMatchCuts([100, 100, 100], 30, 250)).toEqual([
            { sourceIndex: 0, startSec: 30, endSec: 100 },
            { sourceIndex: 1, startSec: 0, endSec: 100 },
            { sourceIndex: 2, startSec: 0, endSec: 50 },
        ])
    })

    it('should stay inside one file when both markers are in it', () => {
        expect(fullMatchCuts([100, 100], 120, 180)).toEqual([{ sourceIndex: 1, startSec: 20, endSec: 80 }])
    })

    it('should take everything without markers', () => {
        expect(fullMatchCuts([100, 50], 0, null)).toEqual([
            { sourceIndex: 0, startSec: 0, endSec: 100 },
            { sourceIndex: 1, startSec: 0, endSec: 50 },
        ])
    })

    it('should be empty when the whistle is not after kick-off', () => {
        expect(fullMatchCuts([100], 60, 40)).toEqual([])
    })

    it('should skip files without a known length', () => {
        expect(fullMatchCuts([100, 0, 100], 0, null).map((c) => c.sourceIndex)).toEqual([0, 2])
    })
})

describe('fullMatchSpan', () => {
    const ev = (type: MatchEvent['type'], t: number, f: number): MatchEvent => ({ id: type, type, matchTimeSec: t, sourceFileIndex: f })
    it('should span kick-off to final whistle on the whole timeline', () => {
        expect(fullMatchSpan([ev('kick_off', 30, 0), ev('final_whistle', 50, 1)], [0, 100], [100, 100])).toEqual({ startSec: 30, endSec: 150, durationSec: 120 })
    })
    it('should default to the start of the first file and the end of the last', () => {
        expect(fullMatchSpan([], [0, 100], [100, 90])).toEqual({ startSec: 0, endSec: 190, durationSec: 190 })
    })
    it('should clamp a whistle past the end of the footage', () => {
        expect(fullMatchSpan([ev('final_whistle', 500, 0)], [0], [100]).endSec).toBe(100)
    })
})

describe('estimateBytes', () => {
    it('should add up each file’s bytes in proportion to the part used', () => {
        const cuts = fullMatchCuts([100, 100], 50, 150)
        expect(estimateBytes(cuts, [1000, 2000], [100, 100])).toBe(500 + 1000)
    })
})

describe('formatBytes', () => {
    it('should use MB below a gigabyte and GB above', () => {
        expect(formatBytes(734_003_200)).toBe('700 MB')
        expect(formatBytes(5.3 * 1024 ** 3)).toBe('5.3 GB')
    })
})

describe('recordingGaps', () => {
    it('should find where a new recording starts (camera stopped, e.g. half time)', () => {
        const files = [{ name: 'GX010001.MP4' }, { name: 'GX020001.MP4' }, { name: 'GX010002.MP4' }, { name: 'GX020002.MP4' }]
        expect(recordingGaps(files, [0, 100, 200, 300])).toEqual([200])
    })
    it('should treat every join of non-GoPro files as a gap', () => {
        expect(recordingGaps([{ name: 'first half.mp4' }, { name: 'second half.mp4' }], [0, 2700])).toEqual([2700])
    })
})
