import { describe, it, expect } from 'vitest'
import { buildPreviewPlan, shouldAdvance, type PreviewStep } from './preview'
import type { HighlightSegment } from './highlights'
import type { MatchEvent } from '../types'

const g = (id: string, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })
const seg = (file: number, start: number, end: number, goals: MatchEvent[]): HighlightSegment =>
    ({ sourceFileIndex: file, startTime: start, endTime: end, duration: end - start, goals })
const REPLAY = { beforeSec: 4, afterSec: 1, speed: 0.5 }

describe('buildPreviewPlan', () => {
    it('should play each clip and then its replays, in reel order', () => {
        const steps = buildPreviewPlan([seg(0, 90, 104, [g('a', 100)]), seg(0, 290, 304, [g('h', 300, { type: 'highlight' })])], [600], REPLAY)
        expect(steps.map((s) => [s.clipIndex, s.replay, s.startSec, s.endSec, s.speed, s.gain])).toEqual([
            [0, false, 90, 104, 1, 1],
            [0, true, 96, 101, 0.5, 0.5],
            [1, false, 290, 304, 1, 1],
        ])
    })

    it('should keep cross-file clips as two steps of the same clip', () => {
        const steps = buildPreviewPlan([seg(1, -6, 8, [])], [100, 200], REPLAY)
        expect(steps.map((s) => [s.clipIndex, s.sourceIndex, s.startSec, s.endSec])).toEqual([[0, 0, 94, 100], [0, 1, 0, 8]])
    })

    it('should have no replay steps without replay options', () => {
        expect(buildPreviewPlan([seg(0, 90, 104, [g('a', 100)])], [600]).every((s) => !s.replay)).toBe(true)
    })
})

describe('shouldAdvance', () => {
    const step: PreviewStep = { sourceIndex: 0, startSec: 90, endSec: 104, speed: 1, gain: 1, replay: false, clipIndex: 0 }

    it('should advance at the end of the step once its seek has landed', () => {
        expect(shouldAdvance(104, step, true)).toBe(true)
        expect(shouldAdvance(100, step, true)).toBe(false)
    })

    it('should never advance before the seek to the step start has landed', () => {
        // e.g. the playhead was at 10:00 when preview started: clip 1 must still play
        expect(shouldAdvance(600, step, false)).toBe(false)
    })
})
