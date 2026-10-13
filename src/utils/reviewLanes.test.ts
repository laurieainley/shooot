import { describe, expect, it } from 'vitest'
import type { Suggestion } from '../types'
import { defaultLane, openingIndex, reviewRailLabel, firstToReviewInLane, laneCounts, laneNeighbour, remainingCounts, laneSwitchVisible, positionInLane, topPicksLine } from './reviewLanes'

const ball = { goal: 'team1' as const, frames: 2 }
const mk = (id: string, over: Partial<Suggestion> = {}): Suggestion => ({ id, globalTimeSec: 0, score: 1, status: 'pending', ...over } as Suggestion)
// 0 plain, 1 top, 2 plain, 3 top (rejected), 4 top
const list = [mk('a'), mk('b', { ball }), mk('c'), mk('d', { ball, status: 'rejected' }), mk('e', { ball })]
const ids = new Set<string>()

describe('laneCounts', () => {
    it('should count every suggestion in All and those with a ball tag in Top picks', () => {
        expect(laneCounts(list)).toEqual({ all: 5, top: 3, other: 2 })
        expect(laneCounts([])).toEqual({ all: 0, top: 0, other: 0 })
    })
})

describe('remainingCounts', () => {
    it('should count only suggestions still to review, per lane', () => {
        // list: a plain, b top, c plain, d top (rejected), e top
        expect(remainingCounts(list, ids)).toEqual({ all: 4, top: 2, other: 2 })
    })
    it('should drop a suggestion once its event exists and bring it back when the event is gone', () => {
        const kept = [mk('a', { status: 'kept', eventId: 'ev1' }), mk('b', { ball })]
        expect(remainingCounts(kept, new Set(['ev1']))).toEqual({ all: 1, top: 1, other: 0 })
        expect(remainingCounts(kept, new Set())).toEqual({ all: 2, top: 1, other: 1 })
    })
})

describe('disjoint lanes', () => {
    it('should keep Other moments to the suggestions without a ball tag', () => {
        expect(positionInLane(list, 'other', 2)).toBe(1)
        expect(positionInLane(list, 'other', 1)).toBe(-1)
        expect(laneNeighbour(list, 'other', 0, 1)).toBe(2)
        expect(laneNeighbour(list, 'other', 2, 1)).toBeNull()
        expect(firstToReviewInLane(list, 'other', ids)).toBe(0)
    })
})

describe('positionInLane', () => {
    it('should be the index in All and the rank among top picks in Top picks', () => {
        expect(positionInLane(list, 'all', 2)).toBe(2)
        expect(positionInLane(list, 'top', 4)).toBe(2)
        expect(positionInLane(list, 'top', 1)).toBe(0)
        expect(positionInLane(list, 'top', 2)).toBe(-1) // not in the lane
    })
})

describe('laneNeighbour', () => {
    it('should step to the next and previous member of the lane only', () => {
        expect(laneNeighbour(list, 'all', 1, 1)).toBe(2)
        expect(laneNeighbour(list, 'top', 1, 1)).toBe(3)
        expect(laneNeighbour(list, 'top', 3, 1)).toBe(4)
        expect(laneNeighbour(list, 'top', 4, -1)).toBe(3)
        expect(laneNeighbour(list, 'top', 2, 1)).toBe(3) // from outside the lane: the next member after it
    })
    it('should return null past either end', () => {
        expect(laneNeighbour(list, 'top', 4, 1)).toBeNull()
        expect(laneNeighbour(list, 'top', 1, -1)).toBeNull()
        expect(laneNeighbour(list, 'all', 0, -1)).toBeNull()
    })
})

describe('laneNeighbour with pending only', () => {
    it('should skip decided members', () => {
        expect(laneNeighbour(list, 'top', 1, 1, ids)).toBe(4) // d is rejected
        expect(laneNeighbour(list, 'all', 0, 1, ids)).toBe(1)
        expect(laneNeighbour(list, 'top', 4, 1, ids)).toBeNull()
    })
})

describe('firstToReviewInLane', () => {
    it('should be the first pending member, else the first member, else -1', () => {
        expect(firstToReviewInLane(list, 'top', ids)).toBe(1)
        expect(firstToReviewInLane(list, 'all', ids)).toBe(0)
        const decided = list.map((s) => ({ ...s, status: 'rejected' as const }))
        expect(firstToReviewInLane(decided, 'top', ids)).toBe(1)
        expect(firstToReviewInLane([mk('x')], 'top', ids)).toBe(-1)
    })
})

describe('laneSwitchVisible', () => {
    it('should show while the ball check runs or is done, or when any suggestion has a ball tag', () => {
        expect(laneSwitchVisible('running', [mk('a')])).toBe(true)
        expect(laneSwitchVisible('done', [mk('a')])).toBe(true)
        expect(laneSwitchVisible('idle', [mk('a', { ball })])).toBe(true)
        expect(laneSwitchVisible('idle', [mk('a')])).toBe(false)
        expect(laneSwitchVisible('failed', [mk('a')])).toBe(false)
    })
})

describe('topPicksLine', () => {
    it('should pluralise and stay empty at none', () => {
        expect(topPicksLine(0)).toBe('')
        expect(topPicksLine(1)).toBe('1 top pick so far')
        expect(topPicksLine(3)).toBe('3 top picks so far')
    })
})

describe('default lane, opening index and rail label', () => {
    it('should default to Top picks while one is still to review, else Other moments', () => {
        expect(defaultLane(list, ids)).toBe('top')
        expect(defaultLane([mk('a'), mk('d', { ball, status: 'rejected' })], ids)).toBe('other')
        expect(defaultLane([mk('a')], ids)).toBe('other')
    })
    it('should open at the first suggestion to review in that lane, or past the end when none is left', () => {
        expect(openingIndex(list, ids)).toBe(1)
        expect(openingIndex([mk('a'), mk('b', { status: 'rejected' })], ids)).toBe(0)
        expect(openingIndex([mk('a', { status: 'rejected' })], ids)).toBe(1)
        expect(openingIndex([], ids)).toBe(0)
    })
    it('should word the rail button with the number left and top picks only when there are some', () => {
        expect(reviewRailLabel(list, ids)).toBe('Review moments (4 left · 2 top picks)')
        expect(reviewRailLabel([mk('a'), mk('b', { ball })], ids)).toBe('Review moments (2 left · 1 top pick)')
        expect(reviewRailLabel([mk('a'), mk('b')], ids)).toBe('Review moments (2 left)')
        expect(reviewRailLabel([mk('a', { status: 'rejected' })], ids)).toBeNull()
    })
})
