import { describe, expect, it } from 'vitest'
import {
    AHEAD_SEC, LARGE_FILE_BYTES, LatestWins, chooseBackend, intersectRanges, mergeSpans, mseMime, planEviction, planNext,
    planQuotaEviction, reconcileSpans, smoothSetting,
} from './msePlan'

describe('planNext', () => {
    it('fetches at the playhead when nothing is buffered there', () => {
        expect(planNext(100, [], 1000)).toEqual({ from: 100 })
        expect(planNext(100, [{ start: 0, end: 50 }], 1000)).toEqual({ from: 100 })
    })
    it('continues after the run while less than AHEAD is in front', () => {
        expect(planNext(10, [{ start: 6, end: 20 }], 1000)).toEqual({ from: 20 })
        expect(planNext(10, [{ start: 6, end: 10 + AHEAD_SEC + 1 }], 1000)).toBeNull()
    })
    it('treats touching spans as one run', () => {
        expect(planNext(10, [{ start: 6, end: 20 }, { start: 20, end: 60 }], 1000)).toBeNull()
    })
    it('stops at the end of the file', () => {
        expect(planNext(990, [{ start: 984, end: 1000 }], 1000)).toBeNull()
        expect(planNext(1000, [], 1000)).toBeNull()
    })
    it('accepts a first keyframe a hair after the playhead', () => {
        expect(planNext(0, [{ start: 0.02, end: 6 }], 1000)).toEqual({ from: 6 })
    })
})

describe('eviction', () => {
    const spans = [{ start: 0, end: 6 }, { start: 90, end: 96 }, { start: 96, end: 102 }, { start: 200, end: 206 }]
    it('removes spans outside the kept band', () => {
        expect(planEviction(100, spans)).toEqual([{ start: 0, end: 6 }, { start: 200, end: 206 }])
    })
    it('keeps 10 s behind: nothing near the playhead goes', () => {
        expect(planEviction(100, [{ start: 90, end: 96 }])).toEqual([])
    })
    it('on quota takes the furthest span but never the playing one', () => {
        expect(planQuotaEviction(100, spans)).toEqual({ start: 0, end: 6 })
        expect(planQuotaEviction(100, [{ start: 96, end: 102 }])).toBeNull()
    })
    it('prefers losing the past over the future at similar distance', () => {
        expect(planQuotaEviction(100, [{ start: 70, end: 76 }, { start: 126, end: 132 }])).toEqual({ start: 70, end: 76 })
    })
})

describe('buffer bookkeeping', () => {
    it('drops spans the browser evicted', () => {
        const spans = [{ start: 0, end: 6 }, { start: 6, end: 12 }]
        expect(reconcileSpans(spans, [{ start: 6.02, end: 12.1 }])).toEqual([{ start: 6, end: 12 }])
        expect(reconcileSpans(spans, [])).toEqual([])
    })
    it('intersects audio and video ranges', () => {
        expect(intersectRanges([{ start: 0, end: 10 }], [{ start: 5, end: 15 }])).toEqual([{ start: 5, end: 10 }])
    })
    it('merges touching spans', () => {
        expect(mergeSpans([{ start: 6, end: 12 }, { start: 0, end: 6 }])).toEqual([{ start: 0, end: 12 }])
    })
})

describe('seek coalescing', () => {
    it('keeps only the newest request', () => {
        const q = new LatestWins<number>()
        q.push(10); q.push(20); q.push(30)
        expect(q.pending).toBe(true)
        expect(q.take()).toBe(30)
        expect(q.pending).toBe(false)
        expect(q.take()).toBeUndefined()
    })
})

describe('chooseBackend', () => {
    const big = LARGE_FILE_BYTES + 1
    const both = { hasMediaSource: true, hasManagedMediaSource: true }
    it('prefers ManagedMediaSource, then MediaSource', () => {
        expect(chooseBackend({ setting: 'large', fileBytes: big, ...both }).backend).toBe('managed-mse')
        expect(chooseBackend({ setting: 'large', fileBytes: big, hasMediaSource: true, hasManagedMediaSource: false }).backend).toBe('mse')
    })
    it('uses the classic path, with a reason, when off, small or unsupported', () => {
        expect(chooseBackend({ setting: 'off', fileBytes: big, ...both })).toEqual({ backend: 'blob', reason: 'smooth playback is off' })
        expect(chooseBackend({ setting: 'large', fileBytes: 1000, ...both }).reason).toBe('file is small')
        expect(chooseBackend({ setting: 'large', fileBytes: big, hasMediaSource: false, hasManagedMediaSource: false }).reason).toMatch(/no MediaSource/)
    })
    it('"always" applies to small files too', () => {
        expect(chooseBackend({ setting: 'always', fileBytes: 10, ...both }).backend).toBe('managed-mse')
    })
})

describe('strings and settings', () => {
    it('builds the mime strings', () => {
        expect(mseMime('video', 'hvc1.1.6.L153.B0')).toBe('video/mp4; codecs="hvc1.1.6.L153.B0"')
        expect(mseMime('audio', 'mp4a.40.2')).toBe('audio/mp4; codecs="mp4a.40.2"')
    })
    it('defaults an unknown stored value to large', () => {
        expect(smoothSetting(undefined)).toBe('large')
        expect(smoothSetting('off')).toBe('off')
        expect(smoothSetting('always')).toBe('always')
    })
})
