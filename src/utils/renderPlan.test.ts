import { describe, it, expect } from 'vitest'
import { buildRenderPlan } from './renderPlan'
import type { HighlightSegment } from './highlights'
import type { MatchEvent } from '../types'

const seg = (sourceFileIndex: number, startTime: number, endTime: number): HighlightSegment => ({
    sourceFileIndex, startTime, endTime, duration: endTime - startTime, goals: [],
})

describe('buildRenderPlan', () => {
    it('should return no cuts for no segments', () => {
        expect(buildRenderPlan([], [100])).toEqual([])
    })

    it('should map a single-file segment to one cut', () => {
        expect(buildRenderPlan([seg(0, 50, 64)], [100])).toEqual([{ sourceIndex: 0, startSec: 50, endSec: 64 }])
    })

    it('should clamp to file bounds', () => {
        expect(buildRenderPlan([seg(0, -3, 11)], [100])).toEqual([{ sourceIndex: 0, startSec: 0, endSec: 11 }])
        expect(buildRenderPlan([seg(0, 95, 104)], [100])).toEqual([{ sourceIndex: 0, startSec: 95, endSec: 100 }])
    })

    it('should split a cross-file segment into previous-file tail and current-file head', () => {
        expect(buildRenderPlan([seg(1, -6, 8)], [100, 200])).toEqual([
            { sourceIndex: 0, startSec: 94, endSec: 100 },
            { sourceIndex: 1, startSec: 0, endSec: 8 },
        ])
    })

    it('should drop zero-length cuts', () => {
        expect(buildRenderPlan([seg(0, 100, 104)], [100])).toEqual([])
    })
})

const g = (id: string, file: number, t: number, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id, matchTimeSec: t, sourceFileIndex: file, type: 'goal', ...extra })
const segWith = (file: number, start: number, end: number, goals: MatchEvent[]): HighlightSegment =>
    ({ sourceFileIndex: file, startTime: start, endTime: end, duration: end - start, goals })
const REPLAY = { beforeSec: 3, afterSec: 1, speed: 0.5 }

describe('buildRenderPlan — replays', () => {
    it('should append a slow replay at half volume after the segment for a goal', () => {
        expect(buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60)])], [100], REPLAY)).toEqual([
            { sourceIndex: 0, startSec: 50, endSec: 64 },
            { sourceIndex: 0, startSec: 57, endSec: 61, speed: 0.5, gain: 0.5 },
        ])
    })

    it('should add one replay per wanted event in a merged segment, in time order, skipping non-scoring', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 70, [g('a', 0, 60), g('h', 0, 62, { type: 'highlight' }), g('b', 0, 66)])], [100], REPLAY)
        expect(cuts.slice(1).map((c) => c.startSec)).toEqual([57, 63])
    })

    it('should honour explicit overrides', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60, { replay: false }), g('s', 0, 61, { type: 'save', replay: true })])], [100], REPLAY)
        expect(cuts.slice(1)).toEqual([{ sourceIndex: 0, startSec: 58, endSec: 62, speed: 0.5, gain: 0.5 }])
    })

    it('should clamp the replay window to its own file', () => {
        const cuts = buildRenderPlan([segWith(1, -5, 9, [g('a', 1, 1)])], [100, 100], REPLAY)
        expect(cuts.at(-1)).toEqual({ sourceIndex: 1, startSec: 0, endSec: 2, speed: 0.5, gain: 0.5 })
    })

    it('should add no replays when the option is omitted', () => {
        expect(buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60)])], [100])).toHaveLength(1)
    })
})

describe('buildRenderPlan — replay crops', () => {
    const box = { x: 0.1, y: 0.3, w: 0.4, h: 0.4 }
    it('should give a replay the crop of its event, and never the clip itself', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60)])], [100], { ...REPLAY, cropFor: () => box })
        expect(cuts[0].crop).toBeUndefined()
        expect(cuts[1].crop).toEqual(box)
        expect(cuts[1].cropLabel).toMatch(/Replay zoom/)
    })
    it('should leave a replay uncropped when the event shows the whole frame', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 64, [g('a', 0, 60)])], [100], { ...REPLAY, cropFor: () => null })
        expect(cuts[1]).toEqual({ sourceIndex: 0, startSec: 57, endSec: 61, speed: 0.5, gain: 0.5 })
    })
    it('should ask for each event in turn', () => {
        const cuts = buildRenderPlan([segWith(0, 50, 70, [g('a', 0, 60), g('b', 0, 66)])], [100],
            { ...REPLAY, cropFor: (e) => (e.id === 'b' ? box : null) })
        expect(cuts.map((c) => !!c.crop)).toEqual([false, false, true])
    })
})
