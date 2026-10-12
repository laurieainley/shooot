import { describe, it, expect } from 'vitest'
import type { Cut, RenderTimeline } from '../render/types'
import type { MatchEvent } from '../types'
import { cutTiming, estimateTimeline, highlightEventTimes, outputTimeAt } from './chapterTimes'
import { highlightsDescription, fullMatchDescription } from './descriptions'
import { mergeOverlappingGoalSegments } from './highlights'
import { buildRenderPlanWithOrigins } from './renderPlan'

const goal = (id: string, t: number, file = 0): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: file, type: 'goal', team: 'Whites' })
const stamps = (text: string): string[] => text.split('\n').filter((l) => /^\d\d:\d\d/.test(l)).map((l) => l.split(' ')[0])
const replay = { beforeSec: 5, afterSec: 3, speed: 0.5 }
const base = { teams: [], cumulativeOffsets: [0, 600], before: 10, after: 4, durationsSec: [600, 600] }

describe('cutTiming', () => {
    it('should place a cut at the cursor with its real source start and speed-adjusted length', () => {
        expect(cutTiming(4, 89, 111)).toEqual({ outStartSec: 4, sourceStartSec: 89, outDurationSec: 22 })
        expect(cutTiming(30, 95, 104, 0.5)).toEqual({ outStartSec: 30, sourceStartSec: 95, outDurationSec: 18 })
    })
})

describe('estimateTimeline', () => {
    it('should start after the intro and pad each cut by the key-frame slack, replays at their speed', () => {
        const cuts: Cut[] = [{ sourceIndex: 0, startSec: 90, endSec: 110 }, { sourceIndex: 0, startSec: 95, endSec: 103, speed: 0.5 }]
        expect(estimateTimeline(cuts, 4)).toEqual([
            { outStartSec: 4, sourceStartSec: 89.5, outDurationSec: 21 },
            { outStartSec: 25, sourceStartSec: 94.5, outDurationSec: 18 },
        ])
    })
})

describe('highlight chapters from the plan (before a render)', () => {
    it('should count merged goals as one clip, replays at their slowed length, the intro and the key-frame slack', () => {
        // A and B overlap: one clip 90–110 (21 s) + two replays of 18 s; C is the next clip.
        const events = [goal('a', 100), goal('b', 106), goal('c', 300)]
        const text = highlightsDescription({ ...base, events, replay, introSec: 4 })
        // 4 (intro) + 21 + 2 × 18 = 61 s; B sits 6.5 s into the merged clip (10 after the clip start of 4).
        expect(stamps(text)).toEqual(['00:00', '00:10', '01:01'])
    })

    it('should follow a cut split across two files', () => {
        const events = [goal('a', 5, 1), goal('b', 200, 1)]
        // A's clip is 595–600 of file 0 then 0–9 of file 1 (5.5 + 10 s with slack): B's clip follows it directly.
        expect(stamps(highlightsDescription({ ...base, events, introSec: 0 }))).toEqual(['00:00', '00:15'])
    })
})

describe('highlight chapters from a real timeline', () => {
    const events = [goal('a', 100), goal('b', 106), goal('c', 300), goal('d', 5, 1)]
    const segments = mergeOverlappingGoalSegments(events, [0, 600], 10, 4)
    const { cuts, origins } = buildRenderPlanWithOrigins(segments, [600, 600], replay)

    // What the engine would report for 1 s GOPs: each cut starts at the key frame at/before its start and ends at the next
    // key frame after its end (but not past the file), after a 4 s title card.
    const fakeEngine = (cs: Cut[]): RenderTimeline => {
        let cursor = 4
        return cs.map((c) => { const t = cutTiming(cursor, Math.floor(c.startSec), Math.min(600, Math.floor(c.endSec) + 1), c.speed ?? 1); cursor += t.outDurationSec; return t })
    }
    const fake = fakeEngine(cuts)

    it('should have a plan of clips and replays, with the last clip split across two files', () => {
        expect(origins.map((o) => `${o.segment}${o.replay ? 'r' : 'c'}`)).toEqual(['0c', '0r', '0r', '1c', '1r', '2c', '2c', '2r'])
    })

    it('should point each chapter at its clip in the rendered video', () => {
        const times = highlightEventTimes({ segments, cuts, origins, timeline: fake, beforeSec: 10 })
        expect(times.get('a')).toBe(4) // clip 90–111 → 21 s, then two 18 s replays
        expect(times.get('b')).toBe(4 + (106 - 10 - 90)) // its own lead-in inside the merged clip
        expect(times.get('c')).toBe(61)
        expect(times.get('d')).toBe(94) // 61 + 15 (clip) + 18 (replay): the split clip starts with its first part
    })

    it('should use the real timeline in the description when it fits the plan, and estimate when it does not', () => {
        const exact = highlightsDescription({ ...base, events, replay, introSec: 4, timeline: fake })
        expect(stamps(exact)).toEqual(['00:00', '00:10', '01:01', '01:34'])
        const wrong = highlightsDescription({ ...base, events, replay, introSec: 4, timeline: fake.slice(1) })
        expect(stamps(wrong)).toEqual(stamps(highlightsDescription({ ...base, events, replay, introSec: 4 })))
    })

    it('should keep chapters in order and fall on the next cut when a clip is missing from the output', () => {
        const gap: RenderTimeline = fake.map((t, i) => (i === 3 ? null : t))
        const times = highlightEventTimes({ segments, cuts, origins, timeline: gap, beforeSec: 10 })
        expect(times.get('c')).toBe(fake[4]!.outStartSec)
    })
})

describe('full match chapters', () => {
    const events: MatchEvent[] = [
        { id: 'k', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
        goal('a', 200),
        { id: 'w', matchTimeSec: 500, sourceFileIndex: 1, type: 'final_whistle' },
        goal('b', 300, 1),
    ]
    const fmBase = { ...base, events, introSec: 4 }

    it('should add the key frame before kick-off that the copy starts at', () => {
        // The copy starts at 59 s (the key frame before kick-off 60), after a 4 s card.
        const cuts: Cut[] = [{ sourceIndex: 0, startSec: 60, endSec: 600 }, { sourceIndex: 1, startSec: 0, endSec: 500 }]
        const timeline = [cutTiming(4, 59, 600), cutTiming(4 + 541, 0, 501)]
        expect(outputTimeAt(190, cuts, timeline, [0, 600])).toBe(4 + (190 - 59))
        expect(stamps(fullMatchDescription({ ...fmBase, timeline }))).toEqual(['00:00', '02:15', '13:55'])
    })

    it('should clamp to the start of the copy before it and to the previous end in a gap', () => {
        const cuts: Cut[] = [{ sourceIndex: 0, startSec: 60, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 100 }]
        const timeline = [cutTiming(0, 59, 101), cutTiming(42, 0, 100)]
        expect(outputTimeAt(10, cuts, timeline, [0, 600])).toBe(0)
        expect(outputTimeAt(300, cuts, timeline, [0, 600])).toBe(42)
    })

    it('should estimate from the plan with half a second of lead-in slack when nothing was rendered', () => {
        const text = fullMatchDescription(fmBase)
        // Goal A: 200 − 10 = 190 on a copy starting at 59.5 → 4 + 130.5.
        expect(stamps(text)[1]).toBe('02:14')
    })
})

describe('full match chapters with replays', () => {
    const events: MatchEvent[] = [
        { id: 'k', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
        goal('a', 200),
        { id: 'w', matchTimeSec: 500, sourceFileIndex: 1, type: 'final_whistle' },
        goal('b', 300, 1),
    ]
    const args = { ...base, events, introSec: 0, replay: { beforeSec: 5, afterSec: 3, speed: 0.5 }, fullMatchReplays: true }

    it('should map events to their normal-speed cut, later ones shifted by the replays before them', () => {
        const off = fullMatchDescription({ ...args, fullMatchReplays: false })
        const on = fullMatchDescription(args)
        const [offA, offB] = stamps(off).slice(1)
        const [onA, onB] = stamps(on).slice(1)
        expect(onA).toBe(offA)
        // Goal b comes after the replay of goal a: 8 s of source at 0.5x = +16 s, plus the estimated key-frame slack (1 s per cut, ~1 s repeated at the join).
        const sec = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
        expect(sec(onB) - sec(offB)).toBeGreaterThanOrEqual(15)
        expect(sec(onB) - sec(offB)).toBeLessThanOrEqual(20)
    })
})
