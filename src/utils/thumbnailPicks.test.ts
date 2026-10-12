import { describe, it, expect } from 'vitest'
import type { MatchEvent } from '../types'
import { THUMB_LEAD_SEC, pickTime, thumbnailFileName, thumbnailPicks } from './thumbnailPicks'

const ev = (id: string, type: MatchEvent['type'], t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, type, matchTimeSec: t, sourceFileIndex: 0, ...extra })
const files = [{ durationSec: 1000 }]

describe('thumbnailPicks', () => {
    it('should list goals and own goals in time order, a quarter second before the moment', () => {
        const picks = thumbnailPicks([ev('b', 'goal', 400, { scorer: 'Sam' }), ev('a', 'own_goal', 100), ev('s', 'save', 200), ev('k', 'kick_off', 60)], [0], files)
        expect(picks.map((p) => p.id)).toEqual(['a', 'b'])
        expect(picks[0].timeSec).toBeCloseTo(100 - THUMB_LEAD_SEC)
        expect(picks[1].label).toBe("Goal 2 of 2 · 6' Sam")
        expect(picks[0].label).toMatch(/^Own goal 1 of 2 · /)
    })

    it('should order goals across files by the whole timeline', () => {
        const picks = thumbnailPicks([ev('x', 'goal', 10, { sourceFileIndex: 1 }), ev('y', 'goal', 900)], [0, 1000], [{ durationSec: 1000 }, { durationSec: 1000 }])
        expect(picks.map((p) => [p.id, p.fileIndex])).toEqual([['y', 0], ['x', 1]])
    })

    it('should fall back to the other tagged moments in time order when there are no goals', () => {
        const picks = thumbnailPicks([ev('f', 'foul', 50), ev('m', 'penalty_missed', 300), ev('h', 'highlight', 100), ev('k', 'kick_off', 1)], [0], files)
        expect(picks.map((p) => p.id)).toEqual(['f', 'h', 'm'])
        expect(picks[2].label).toMatch(/^Penalty missed 3 of 3/)
    })

    it('should fall back to the middle of the match, and ignore unlinked events', () => {
        const picks = thumbnailPicks([ev('u', 'goal', 5, { unlinked: true })], [0], files)
        expect(picks).toHaveLength(1)
        expect(picks[0].event).toBeNull()
        expect(picks[0].timeSec).toBeCloseTo(500)
        expect(picks[0].label).toBe('Middle of the match')
    })

    it('should offer nothing without files', () => {
        expect(thumbnailPicks([ev('a', 'goal', 5)], [], [])).toEqual([])
    })
})

describe('pickTime', () => {
    it('should stay inside the file and apply the fine-tune', () => {
        expect(pickTime(0.1, 100)).toBe(0)
        expect(pickTime(99.99, 100)).toBeCloseTo(99.74)
        expect(pickTime(100, 100, 1)).toBeCloseTo(99.9)
        expect(pickTime(10, 100, -1)).toBeCloseTo(8.75)
    })
})

describe('thumbnailFileName', () => {
    const teams = [{ name: 'Whites', color: '', roster: [] }, { name: 'Colours', color: '', roster: [] }]
    it('should name it like the reel but without the score', () => {
        expect(thumbnailFileName({ kind: 'highlights', title: 'Matchday 3', teams })).toBe('Matchday 3 - Whites v Colours (highlights thumbnail).jpg')
        expect(thumbnailFileName({ kind: 'fullMatch', title: 'Matchday 3', teams })).toBe('Matchday 3 - Whites v Colours (full match thumbnail).jpg')
    })
    it('should cope with no title or unnamed teams and clean illegal characters', () => {
        expect(thumbnailFileName({ kind: 'highlights', title: null, teams })).toBe('Whites v Colours (highlights thumbnail).jpg')
        expect(thumbnailFileName({ kind: 'highlights', title: null, teams: [] })).toBe('Match (highlights thumbnail).jpg')
        expect(thumbnailFileName({ kind: 'highlights', title: 'a/b', teams: [{ ...teams[0], name: 'A:B' }, teams[1]] })).toBe('a b - A B v Colours (highlights thumbnail).jpg')
    })
})
