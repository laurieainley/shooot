import { describe, expect, it } from 'vitest'
import type { Suggestion } from '../types'
import { findGoalsChip, momentAfter, momentAt, momentChipText, momentPosition } from './foundMoments'

const sug = (id: string, t: number, status: Suggestion['status'] = 'pending', ball = false): Suggestion =>
    ({ id, globalTimeSec: t, score: 1, source: 'audio', status, ...(ball ? { ball: { x: 0, y: 0 } as unknown as Suggestion['ball'] } : {}) })
const none = new Set<string>()

describe('momentAt', () => {
    const moments = [sug('a', 100), sug('b', 130)]
    it('should find the moment whose window holds the playhead (8 s before to 3 s after)', () => {
        expect(momentAt(moments, 92)?.id).toBe('a')
        expect(momentAt(moments, 100)?.id).toBe('a')
        expect(momentAt(moments, 103)?.id).toBe('a')
    })
    it('should find nothing outside every window', () => {
        expect(momentAt(moments, 91)).toBeNull()
        expect(momentAt(moments, 104)).toBeNull()
        expect(momentAt([], 100)).toBeNull()
    })
    it('should take the nearest when windows overlap', () => {
        expect(momentAt([sug('a', 100), sug('b', 104)], 103)?.id).toBe('b')
    })
})

describe('momentAfter', () => {
    it('should give the first pending moment later than the one just decided', () => {
        expect(momentAfter([sug('b', 104), sug('c', 200)], 100)?.id).toBe('b')
        expect(momentAfter([sug('c', 200)], 200)).toBeNull()
        expect(momentAfter([], 0)).toBeNull()
    })
})

describe('momentPosition', () => {
    it('should count in match order over every found moment, decided or not', () => {
        const all = [sug('c', 300), sug('a', 100, 'rejected'), sug('b', 200)]
        expect(momentPosition(all, 'b')).toEqual({ index: 2, total: 3 })
        expect(momentPosition(all, 'zzz')).toBeNull()
    })
})

describe('momentChipText', () => {
    it('should name a top pick, with place and match clock', () => {
        expect(momentChipText(sug('a', 1, 'pending', true), { index: 3, total: 7 }, '12:34')).toBe('★ Top pick · 3 of 7 · 12:34')
    })
    it('should call an ordinary one a found moment', () => {
        expect(momentChipText(sug('a', 1), { index: 1, total: 2 }, '0:05')).toBe('Found moment · 1 of 2 · 0:05')
    })
})

describe('findGoalsChip', () => {
    const base = { running: null as number | null, current: true, suggestions: [] as Suggestion[], eventIds: none }
    it('should offer Find goals before a run', () => {
        expect(findGoalsChip(base)).toEqual({ state: 'idle', label: 'Find goals' })
    })
    it('should show progress while it runs', () => {
        expect(findGoalsChip({ ...base, running: 42 })).toEqual({ state: 'running', label: 'Finding goals · 42%' })
    })
    it('should count what is still to check, with top picks', () => {
        const s = [sug('a', 1, 'pending', true), sug('b', 2), sug('c', 3, 'rejected')]
        expect(findGoalsChip({ ...base, suggestions: s })).toEqual({ state: 'found', label: '2 found · 1 top pick' })
        expect(findGoalsChip({ ...base, suggestions: [sug('a', 1, 'pending', true), sug('b', 2, 'pending', true), sug('c', 3)] }).label).toBe('3 found · 2 top picks')
        expect(findGoalsChip({ ...base, suggestions: [sug('a', 1), sug('b', 2)] }).label).toBe('2 found')
    })
    it('should say all checked once nothing is pending', () => {
        expect(findGoalsChip({ ...base, suggestions: [sug('a', 1, 'rejected')] })).toEqual({ state: 'checked', label: 'All found moments checked' })
    })
    it('should ignore moments from other footage', () => {
        expect(findGoalsChip({ ...base, current: false, suggestions: [sug('a', 1)] }).state).toBe('idle')
    })
})
