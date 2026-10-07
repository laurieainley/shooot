import { describe, it, expect } from 'vitest'
import { buildPreviewPlan, shouldAdvance, previewVolume, type PreviewStep } from './preview'
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

describe('buildPreviewPlan — crops', () => {
    it('should carry the replay crop to the step, clips stay whole', () => {
        const box = { x: 0.1, y: 0.3, w: 0.4, h: 0.4 }
        const steps = buildPreviewPlan([seg(0, 90, 104, [g('a', 100)])], [600], { ...REPLAY, cropFor: () => box })
        expect(steps.map((s) => s.crop ?? null)).toEqual([null, box])
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

describe('previewVolume', () => {
    const step = (gain: number): PreviewStep => ({ sourceIndex: 0, startSec: 0, endSec: 5, speed: gain < 1 ? 0.5 : 1, gain, replay: gain < 1, clipIndex: 0 })

    it('should play a replay at half the volume the viewer chose, as rendered', () => {
        expect(previewVolume(0.8, step(0.5))).toBeCloseTo(0.4)
        expect(previewVolume(1, step(0.5))).toBe(0.5)
    })

    it('should leave a clip at the chosen volume', () => {
        expect(previewVolume(0.8, step(1))).toBe(0.8)
    })

    it('should stay within 0 to 1 whatever the inputs', () => {
        expect(previewVolume(2, step(1))).toBe(1)
        expect(previewVolume(-1, step(1))).toBe(0)
        expect(previewVolume(Number.NaN, step(0.5))).toBe(0.5)
    })
})
