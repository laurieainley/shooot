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
    it('should merge starred events that overlap into one teaser clip', () => {
        const r = highlightsCuts({ ...base, events: [ev('a', 40, star), ev('b', 46, star)], teaser: true })
        expect(r.teaserCount).toBe(1)
        expect(r.cuts[0]).toMatchObject({ startSec: 30, endSec: 50 })
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

describe('teaserLength', () => {
    it('should count the starred moments and add up the teaser cuts only (no replays, nothing from the reel)', () => {
        const events = [ev('a', 40, star), ev('b', 70, star), ev('c', 90)]
        expect(teaserLength({ ...base, events })).toEqual({ moments: 2, seconds: 28 })
    })
    it('should be empty when nothing is starred', () => {
        expect(teaserLength({ ...base, events: [ev('a', 40)] })).toEqual({ moments: 0, seconds: 0 })
    })
})
