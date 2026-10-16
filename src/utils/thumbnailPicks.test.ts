import { describe, it, expect } from 'vitest'
import type { MatchEvent } from '../types'
import { THUMB_LEAD_SEC, clampPan, coverSpan, defaultPickIndex, panCrop, pickTime, thumbnailFileName, thumbnailPicks } from './thumbnailPicks'

const ev = (id: string, type: MatchEvent['type'], t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, type, matchTimeSec: t, sourceFileIndex: 0, ...extra })
const files = [{ durationSec: 1000 }]

describe('thumbnailPicks', () => {
    it('should list every tagged moment but markers in time order, a quarter second before it, numbered across all', () => {
        const picks = thumbnailPicks([
            ev('b', 'goal', 400, { scorer: 'Sam' }), ev('a', 'own_goal', 100), ev('s', 'save', 200), ev('k', 'kick_off', 60),
            ev('h', 'highlight', 300, { scorer: 'Thom', notes: 'Great tackle' }),
        ], [0], files)
        expect(picks.map((p) => p.id)).toEqual(['a', 's', 'h', 'b'])
        expect(picks[0].timeSec).toBeCloseTo(100 - THUMB_LEAD_SEC)
        expect(picks[3].label).toBe("4 of 4 · Goal · 6' Sam")
        expect(picks[0].label).toMatch(/^1 of 4 · Own goal · /)
        expect(picks[2].label).toBe("3 of 4 · Highlight · 5' Thom — Great tackle")
    })

    it('should open on the first goal, else the first pick', () => {
        const picks = thumbnailPicks([ev('h', 'highlight', 50), ev('g', 'goal', 400), ev('s', 'save', 500)], [0], files)
        expect(defaultPickIndex(picks)).toBe(1)
        expect(defaultPickIndex(thumbnailPicks([ev('h', 'highlight', 50), ev('s', 'save', 500)], [0], files))).toBe(0)
        expect(defaultPickIndex([])).toBe(0)
    })

    it('should order goals across files by the whole timeline', () => {
        const picks = thumbnailPicks([ev('x', 'goal', 10, { sourceFileIndex: 1 }), ev('y', 'goal', 900)], [0, 1000], [{ durationSec: 1000 }, { durationSec: 1000 }])
        expect(picks.map((p) => [p.id, p.fileIndex])).toEqual([['y', 0], ['x', 1]])
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

describe('crop panning', () => {
    const crop = { x: 0.5, y: 0.2, w: 0.3, h: 0.4 }

    it('should keep the moved crop inside the frame and leave in-range pans alone', () => {
        expect(clampPan(crop, { x: 0.1, y: -0.1 })).toEqual({ x: 0.1, y: -0.1 })
        const high = clampPan(crop, { x: 0.9, y: 0.9 })
        expect(high.x).toBeCloseTo(0.2)
        expect(high.y).toBeCloseTo(0.4)
        const low = clampPan(crop, { x: -2, y: -2 })
        expect(low.x).toBeCloseTo(-0.5)
        expect(low.y).toBeCloseTo(-0.2)
    })

    it('should move the crop without resizing it', () => {
        const moved = panCrop(crop, { x: 0.1, y: 0.1 })
        expect(moved.x).toBeCloseTo(0.6)
        expect(moved.y).toBeCloseTo(0.3)
        const far = panCrop(crop, { x: 5, y: 5 })
        expect(far.x + far.w).toBeCloseTo(1)
        expect(far.y + far.h).toBeCloseTo(1)
        expect([far.w, far.h]).toEqual([0.3, 0.4])
    })

    it('should work out what a 16:9 draw of a crop shows', () => {
        // A 16:9 crop of a 16:9 frame shows all of it.
        expect(coverSpan({ x: 0, y: 0, w: 0.5, h: 0.5 }, 1920, 1080)).toEqual({ w: 0.5, h: 0.5 })
        // A taller crop is trimmed top and bottom; a wider one left and right.
        expect(coverSpan({ x: 0, y: 0, w: 0.25, h: 0.5 }, 1920, 1080).h).toBeCloseTo(0.25)
        expect(coverSpan({ x: 0, y: 0, w: 1, h: 0.5 }, 1920, 1080).w).toBeCloseTo(0.5)
    })
})
