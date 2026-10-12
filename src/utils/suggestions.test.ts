import { describe, expect, it } from 'vitest'
import { detectionReport, effectiveStatus, firstPendingIndex, runMatchesFiles, mergeSuggestions, reviewCounts, suggestionMarks } from './suggestions'
import type { Suggestion } from '../types'

const s = (id: string, t: number, status: Suggestion['status'] = 'pending', extra: Partial<Suggestion> = {}): Suggestion =>
    ({ id, globalTimeSec: t, score: 1, source: 'audio', status, ...extra })
let n = 0
const makeId = (): string => `new${++n}`

describe('effectiveStatus', () => {
    it('should treat a kept suggestion whose event was undone as pending', () => {
        const k = s('a', 10, 'kept', { eventId: 'e1', keptAs: 'goal' })
        expect(effectiveStatus(k, new Set(['e1']))).toBe('kept')
        expect(effectiveStatus(k, new Set())).toBe('pending')
    })
    it('should treat a rejected suggestion whose kept event is back as kept', () => {
        const r = s('a', 10, 'rejected', { eventId: 'e1', keptAs: 'goal' })
        expect(effectiveStatus(r, new Set(['e1']))).toBe('kept')
        expect(effectiveStatus(r, new Set())).toBe('rejected')
    })
})

describe('mergeSuggestions', () => {
    it('should keep decisions, replace pending and skip new moments next to decided ones', () => {
        const prev = [s('a', 100, 'kept', { eventId: 'e1', keptAs: 'goal' }), s('b', 300, 'rejected'), s('c', 500)]
        const out = mergeSuggestions(prev, [{ timeSec: 105, score: 9 }, { timeSec: 700, score: 5 }, { timeSec: 505, score: 4 }], 20, makeId)
        expect(out.map((x) => x.globalTimeSec)).toEqual([100, 300, 505, 700])
        expect(out.find((x) => x.globalTimeSec === 100)?.status).toBe('kept')
        expect(out.some((x) => x.id === 'c')).toBe(false)
    })
})

describe('reviewCounts', () => {
    it('should count by effective status and kept type', () => {
        const list = [s('a', 1, 'kept', { eventId: 'e1', keptAs: 'goal' }), s('b', 2, 'kept', { eventId: 'gone', keptAs: 'save' }), s('c', 3, 'rejected'), s('d', 4)]
        expect(reviewCounts(list, new Set(['e1']))).toEqual({ total: 4, kept: 1, rejected: 1, pending: 2, byType: { goal: 1 } })
    })
})

describe('suggestionMarks', () => {
    it('should place pending suggestions as a percentage of the timeline', () => {
        expect(suggestionMarks([s('a', 50), s('b', 75, 'rejected')], new Set(), 100)).toEqual([{ id: 'a', leftPct: 50, timeSec: 50, top: false }])
        expect(suggestionMarks([s('t', 50, 'pending', { ball: { goal: 'team1', frames: 2 } })], new Set(), 100)[0].top).toBe(true)
        expect(suggestionMarks([s('a', 50)], new Set(), 0)).toEqual([])
    })
})

describe('detectionReport', () => {
    it('should list counts and settings without timestamps', () => {
        const run = { createdAt: 0, source: 'audio' as const, configVersion: 1, analysedSec: 2940, total: 30 }
        const counts = { total: 30, kept: 6, rejected: 20, pending: 4, byType: { goal: 5, save: 1 } }
        const text = detectionReport(run, counts)
        expect(text).toContain('Find goals (Beta), audio, config v1')
        expect(text).toContain('Analysed: 49:00')
        expect(text).toContain('Range: —')
        expect(detectionReport({ ...run, bounded: true }, counts)).toContain('Range: kick off → final whistle')
        expect(detectionReport({ ...run, bounded: false }, counts)).toContain('Range: whole video')
        expect(text).toContain('Run time: —')
        expect(text).toContain('Kept 6 of 30 (goal 5, save 1), rejected 20, not reviewed 4')
    })
})

describe('detectionReport run time', () => {
    it('should include the run time in seconds', () => {
        const text = detectionReport({ createdAt: 0, source: 'audio', configVersion: 2, analysedSec: 600, total: 3, durationMs: 12400 },
            { total: 3, kept: 1, rejected: 1, pending: 1, byType: {} })
        expect(text).toContain('Run time: 12s')
    })
})

describe('runMatchesFiles', () => {
    const run = { createdAt: 0, source: 'audio' as const, configVersion: 2, analysedSec: 1, total: 0 }
    it('should accept a run without file keys', () => { expect(runMatchesFiles(run, ['a'])).toBe(true) })
    it('should compare keys in order', () => {
        expect(runMatchesFiles({ ...run, fileKeys: ['a', 'b'] }, ['a', 'b'])).toBe(true)
        expect(runMatchesFiles({ ...run, fileKeys: ['a', 'b'] }, ['b', 'a'])).toBe(false)
        expect(runMatchesFiles({ ...run, fileKeys: ['a'] }, ['a', 'b'])).toBe(false)
    })
})

describe('firstPendingIndex', () => {
    it('should pick the first pending one, or the end when none is pending', () => {
        expect(firstPendingIndex([s('a', 1, 'rejected'), s('b', 2), s('c', 3)], new Set())).toBe(1)
        expect(firstPendingIndex([s('a', 1, 'rejected'), s('b', 2, 'rejected')], new Set())).toBe(2)
        expect(firstPendingIndex([], new Set())).toBe(0)
    })
})

describe('detectionReport ball check', () => {
    const run = { createdAt: 0, source: 'audio' as const, configVersion: 2, analysedSec: 600, total: 3 }
    const counts = { kept: 1, rejected: 0, pending: 2, total: 3, byType: {} } as never
    it('should add the execution provider, seconds and tag count', () => {
        expect(detectionReport(run, counts, { ep: 'webgpu', ms: 41200, tagged: 2 }).split('\n').pop()).toBe('Ball check: webgpu, 41 s, 2 tagged')
    })
    it('should add the error instead when the ball check failed', () => {
        expect(detectionReport(run, counts, { error: 'Ball check unavailable: model not found.' }).split('\n').pop()).toBe('Ball check: Ball check unavailable: model not found.')
    })
    it('should leave the line out without a ball check', () => {
        expect(detectionReport(run, counts)).not.toContain('Ball check')
    })
})
