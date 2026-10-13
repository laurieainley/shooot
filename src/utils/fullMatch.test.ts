import { describe, it, expect } from 'vitest'
import { estimateBytes, formatBytes, fullMatchCuts, fullMatchSpan, recordingGaps, withReplays } from './fullMatch'
import type { MatchEvent } from '../types'
import type { Cut } from '../render/types'

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

    it('should never show 0 MB for a small but non-empty output', () => {
        expect(formatBytes(200_000)).toBe('1 MB')
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

describe('withReplays', () => {
    const g = (id: string, t: number, file = 0): MatchEvent => ({ id, type: 'goal', matchTimeSec: t, sourceFileIndex: file })
    const opts = { beforeSec: 3, afterSec: 1, speed: 0.5 }
    const view = (cuts: Cut[]): [number, number, number, number | undefined][] => cuts.map((c) => [c.sourceIndex, c.startSec, c.endSec, c.speed])

    it('should leave the cuts alone without replay events', () => {
        const cuts = fullMatchCuts([100], 10, 90)
        expect(withReplays(cuts, [{ id: 's', type: 'save', matchTimeSec: 50, sourceFileIndex: 0 }], [0], opts)).toEqual(cuts)
    })

    it('should split after the replay window, insert the replay and resume with no gap', () => {
        const out = withReplays(fullMatchCuts([100], 10, 90), [g('a', 40)], [0], opts)
        expect(view(out)).toEqual([[0, 10, 41, undefined], [0, 37, 41, 0.5], [0, 41, 90, undefined]])
        expect(out[1]).toMatchObject({ gain: 0.5 })
    })

    it('should keep each replay inside the file and split across a file boundary', () => {
        const cuts = fullMatchCuts([100, 100], 50, 150)
        const out = withReplays(cuts, [g('a', 99), g('b', 1, 1)], [0, 100], opts)
        expect(view(out)).toEqual([[0, 50, 100, undefined], [0, 96, 100, 0.5], [1, 0, 2, undefined], [1, 0, 2, 0.5], [1, 2, 50, undefined]])
    })

    it('should clamp replays to kick-off and the final whistle', () => {
        const out = withReplays(fullMatchCuts([100], 10, 90), [g('a', 11), g('b', 89.5)], [0], opts)
        expect(view(out)).toEqual([[0, 10, 12, undefined], [0, 10, 12, 0.5], [0, 12, 90, undefined], [0, 86.5, 90, 0.5]])
    })

    it('should handle two goals close together in order, covering the match once', () => {
        const out = withReplays(fullMatchCuts([100], 0, 100), [g('b', 42), g('a', 40)], [0], opts)
        expect(view(out)).toEqual([[0, 0, 41, undefined], [0, 37, 41, 0.5], [0, 41, 43, undefined], [0, 39, 43, 0.5], [0, 43, 100, undefined]])
        const live = out.filter((c) => c.speed === undefined)
        expect(live.reduce((s, c) => s + c.endSec - c.startSec, 0)).toBe(100)
    })

    it('should honour a per-event replay switch and the crop resolver', () => {
        const events = [{ ...g('a', 40), replay: false }, g('b', 60)]
        const crop = { x: 0, y: 0, w: 0.5, h: 0.5 }
        const out = withReplays(fullMatchCuts([100], 0, 100), events, [0], { ...opts, cropFor: () => crop })
        expect(out.filter((c) => c.speed !== undefined)).toEqual([expect.objectContaining({ startSec: 57, endSec: 61, crop })])
    })
})
