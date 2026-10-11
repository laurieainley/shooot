import { describe, expect, it } from 'vitest'
import { detectionReport, effectiveStatus, mergeSuggestions, reviewCounts, suggestionMarks } from './suggestions'
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
        expect(suggestionMarks([s('a', 50), s('b', 75, 'rejected')], new Set(), 100)).toEqual([{ id: 'a', leftPct: 50, timeSec: 50 }])
        expect(suggestionMarks([s('a', 50)], new Set(), 0)).toEqual([])
    })
})

describe('detectionReport', () => {
    it('should list counts and settings without timestamps', () => {
        const text = detectionReport({ createdAt: 0, source: 'audio', configVersion: 1, analysedSec: 2940, total: 30 },
            { total: 30, kept: 6, rejected: 20, pending: 4, byType: { goal: 5, save: 1 } })
        expect(text).toContain('Find goals (Beta), audio, config v1')
        expect(text).toContain('Analysed: 49:00')
        expect(text).toContain('Kept 6 of 30 (goal 5, save 1), rejected 20, not reviewed 4')
    })
})
