import { describe, it, expect } from 'vitest'
import { highlightsCuts, teaserEvents, teaserLength } from './teaser'
import type { MatchEvent } from '../types'
import type { ReplayOptions } from './renderPlan'

const ev = (id: string, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, type: 'goal', matchTimeSec: t, sourceFileIndex: 0, ...extra })
const star = { marks: ['teaser' as const] }
const replay: ReplayOptions = { beforeSec: 4, afterSec: 1, speed: 0.5 }
const base = { cumulativeOffsets: [0, 100], durationsSec: [100, 100], before: 10, after: 4, replay }

describe('teaserEvents', () => {
    it('should keep linked starred non-marker events in match order', () => {
        const events = [
            ev('b', 20, { sourceFileIndex: 1, ...star }), ev('a', 70, star), ev('c', 30), ev('u', 40, { unlinked: true, ...star }),
            ev('k', 5, { type: 'kick_off' }),
        ]
        expect(teaserEvents(events).map((e) => e.id)).toEqual(['a', 'b'])
    })
})

describe('highlightsCuts', () => {
    it('should put a starred goal first with no slow-mo, then the unchanged reel with its replay', () => {
        const events = [ev('g', 40, star)]
        const r = highlightsCuts({ ...base, events, teaser: true })
        expect(r.teaserCount).toBe(1)
        expect(r.cuts[0]).toEqual({ sourceIndex: 0, startSec: 30, endSec: 44 })
        const off = highlightsCuts({ ...base, events, teaser: false })
        expect(r.cuts.slice(1)).toEqual(off.cuts)
        expect(off.cuts.some((c) => c.speed !== undefined)).toBe(true)
        expect(r.origins[0]).toEqual({ segment: -1, replay: false })
        expect(r.origins.slice(1)).toEqual(off.origins)
    })
    it('should say which teaser clip each teaser cut belongs to', () => {
        const events = [ev('a', 95, star), ev('b', 2, { sourceFileIndex: 1, ...star })]
        const r = highlightsCuts({ ...base, events, teaser: true })
        // a: one cut; b (8 s before file 1 starts) crosses the join: two cuts, one clip
        expect(r.teaserClips).toEqual([0, 1, 1])
        expect(r.teaserClips.length).toBe(r.teaserCount)
        expect(highlightsCuts({ ...base, events, teaser: false }).teaserClips).toEqual([])
    })
    it('should plan a starred save by its own window, not the merged reel clip', () => {
        const events = [ev('s', 50, { type: 'save', ...star }), ev('g', 55)]
        const r = highlightsCuts({ ...base, events, teaser: true })
        expect(r.cuts[0]).toEqual({ sourceIndex: 0, startSec: 40, endSec: 54 })
        expect(r.cuts[1]).toMatchObject({ sourceIndex: 0, startSec: 40, endSec: 59 })
        expect(r.teaserCount).toBe(1)
    })
    it('should keep starred events that overlap as their own teaser clips (never merged)', () => {
        const r = highlightsCuts({ ...base, events: [ev('a', 40, star), ev('b', 43, star)], teaser: true })
        expect(r.teaserCount).toBe(2)
        expect(r.cuts.slice(0, 2)).toEqual([{ sourceIndex: 0, startSec: 30, endSec: 44 }, { sourceIndex: 0, startSec: 33, endSec: 47 }])
        expect(r.teaserClips).toEqual([0, 1])
        expect(r.teaserSegments.map((s) => s.goals.map((g) => g.id))).toEqual([['a'], ['b']])
    })
    it('should skip a starred event in an unlinked file', () => {
        const r = highlightsCuts({ ...base, events: [ev('a', 40, { unlinked: true, ...star }), ev('g', 60)], teaser: true })
        expect(r.teaserCount).toBe(0)
    })
    it('should split a teaser clip at a file join, both parts before the reel', () => {
        const r = highlightsCuts({ ...base, events: [ev('a', 2, { sourceFileIndex: 1, ...star })], teaser: true })
        expect(r.teaserCount).toBe(2)
        expect(r.cuts.slice(0, 2)).toEqual([{ sourceIndex: 0, startSec: 92, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 6 }])
        expect(r.cuts.length).toBeGreaterThan(2)
    })
    it('should equal today\'s plan when the teaser is off or nothing is starred', () => {
        const plain = [ev('g', 40), ev('h', 70)]
        const off = highlightsCuts({ ...base, events: plain, teaser: false })
        expect(off.teaserCount).toBe(0)
        expect(highlightsCuts({ ...base, events: plain, teaser: true })).toEqual(off)
        const starred = highlightsCuts({ ...base, events: [ev('g', 40, star), ev('h', 70)], teaser: false })
        expect(starred.cuts).toEqual(off.cuts)
        expect(starred.teaserCount).toBe(0)
    })
})

describe('highlightsCuts teaser edits', () => {
    const crop = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    // The reel's segments hold the (edited) event objects themselves: compare their windows and ids.
    const reelOf = (r: ReturnType<typeof highlightsCuts>) => ({
        cuts: r.cuts.slice(r.teaserCount), origins: r.origins.slice(r.teaserCount),
        segments: r.segments.map((s) => [s.sourceFileIndex, s.startTime, s.endTime, s.goals.map((g) => g.id)]),
    })
    it('should use the moment\'s own seconds before and after, and leave the reel alone', () => {
        const plain = highlightsCuts({ ...base, events: [ev('g', 40, star), ev('h', 70)], teaser: true })
        const r = highlightsCuts({ ...base, events: [ev('g', 40, { ...star, teaser: { beforeSec: 3, afterSec: 6, caption: 'Wow' } }), ev('h', 70)], teaser: true })
        expect(r.cuts[0]).toEqual({ sourceIndex: 0, startSec: 37, endSec: 46 })
        expect(r.teaserCount).toBe(1)
        expect(reelOf(r)).toEqual(reelOf(plain))
    })
    it('should clamp the moment\'s window to its files', () => {
        const r = highlightsCuts({ ...base, events: [ev('g', 98, { ...star, teaser: { afterSec: 10 } })], teaser: true })
        expect(r.cuts[0]).toEqual({ sourceIndex: 0, startSec: 88, endSec: 100 })
    })
    it('should follow the clip with its slow-mo replay (match window, speed, gain), marked as a replay', () => {
        const cropFor = () => crop
        const r = highlightsCuts({ ...base, replay: { ...replay, cropFor }, events: [ev('s', 40, { type: 'save', ...star, teaser: { replay: true } })], teaser: true })
        expect(r.teaserCount).toBe(2)
        expect(r.cuts[0]).toEqual({ sourceIndex: 0, startSec: 30, endSec: 44 })
        expect(r.cuts[1]).toMatchObject({ sourceIndex: 0, startSec: 36, endSec: 41, speed: 0.5, gain: 0.5, crop })
        expect(r.origins.slice(0, 2)).toEqual([{ segment: -1, replay: false }, { segment: -1, replay: true }])
        expect(r.teaserClips).toEqual([0, 0])
    })
    it('should frame the teaser replay by the teaser crop, then the event\'s, while the reel keeps the event\'s', () => {
        const own = { x: 0, y: 0, w: 0.4, h: 0.4 }
        const tcrop = { x: 0.6, y: 0.6, w: 0.4, h: 0.4 }
        const cropFor = (e: MatchEvent) => (typeof e.replayCrop === 'object' ? e.replayCrop : null)
        const opts = { ...base, replay: { ...replay, cropFor }, teaser: true }
        const r = highlightsCuts({ ...opts, events: [ev('g', 40, { ...star, replayCrop: own, teaser: { replay: true, replayCrop: tcrop } })] })
        expect(r.cuts[1].crop).toEqual(tcrop)
        expect(r.cuts.slice(r.teaserCount).find((c) => c.speed)?.crop).toEqual(own)
        const fallback = highlightsCuts({ ...opts, events: [ev('g', 40, { ...star, replayCrop: own, teaser: { replay: true } })] })
        expect(fallback.cuts[1].crop).toEqual(own)
        const plain = highlightsCuts({ ...opts, events: [ev('g', 40, { ...star, replayCrop: own })] })
        expect(reelOf(r)).toEqual(reelOf(plain))
    })
    it('should plan no teaser replay for a moment whose clip is empty (0 s before and after)', () => {
        const r = highlightsCuts({ ...base, events: [ev('g', 40, { ...star, teaser: { beforeSec: 0, afterSec: 0, replay: true } }), ev('h', 60, { ...star, teaser: { replay: true } })], teaser: true })
        expect(r.teaserClips).toEqual([1, 1])
        expect(r.cuts.slice(0, r.teaserCount).map((c) => [c.startSec, c.speed])).toEqual([[50, undefined], [56, 0.5]])
    })
    it('should plan no teaser replay without replay options', () => {
        const r = highlightsCuts({ ...base, replay: undefined, events: [ev('g', 40, { ...star, teaser: { replay: true } })], teaser: true })
        expect(r.teaserCount).toBe(1)
    })
})

describe('teaserLength', () => {
    it('should include a moment\'s teaser replay at its speed and its own seconds', () => {
        const events = [ev('a', 40, { ...star, teaser: { beforeSec: 2, afterSec: 3, replay: true } })]
        // 5 s clip + 5 s replay window at 0.5x = 15 s
        expect(teaserLength({ ...base, events })).toEqual({ moments: 1, seconds: 15 })
    })
    it('should count the starred moments and add up the teaser cuts only (no replays, nothing from the reel)', () => {
        const events = [ev('a', 40, star), ev('b', 70, star), ev('c', 90)]
        expect(teaserLength({ ...base, events })).toEqual({ moments: 2, seconds: 28 })
    })
    it('should be empty when nothing is starred', () => {
        expect(teaserLength({ ...base, events: [ev('a', 40)] })).toEqual({ moments: 0, seconds: 0 })
    })
})
