import { describe, expect, it } from 'vitest'
import { finalScore } from './score'
import { extraText, missingText, scoreGap, toFindText } from './scoreGap'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }]

describe('scoreGap', () => {
    it('should be null without a known score', () => {
        expect(scoreGap([1, 1], null)).toBeNull()
    })
    it('should count what is still missing per team', () => {
        expect(scoreGap([11, 8], [13, 9])).toEqual({ missing: [2, 1], extra: [0, 0], complete: false })
    })
    it('should be complete when tagged equals known', () => {
        expect(scoreGap([13, 9], [13, 9])).toEqual({ missing: [0, 0], extra: [0, 0], complete: true })
        expect(scoreGap([0, 0], [0, 0])?.complete).toBe(true)
    })
    it('should report extra goals when a team is over', () => {
        expect(scoreGap([14, 9], [13, 9])).toEqual({ missing: [0, 0], extra: [1, 0], complete: false })
    })
    it('should handle one team short and the other over', () => {
        expect(scoreGap([14, 7], [13, 9])).toEqual({ missing: [0, 2], extra: [1, 0], complete: false })
    })
    it('should work from finalScore so own goals and penalty goals count as everywhere else', () => {
        const ev = (id: string, type: MatchEvent['type'], team: string): MatchEvent => ({ id, type, team, matchTimeSec: 1, sourceFileIndex: 0 })
        const tagged = finalScore([ev('a', 'goal', 'Whites'), ev('b', 'own_goal', 'Whites'), ev('c', 'pen_goal', 'Colours')], teams)
        expect(scoreGap(tagged, [3, 1])).toEqual({ missing: [1, 0], extra: [0, 0], complete: false })
    })
})

describe('gap wording', () => {
    it('should say how many are left to find', () => {
        expect(toFindText({ missing: [2, 1], extra: [0, 0], complete: false })).toBe('3 to find')
    })
    it('should list the missing goals by team', () => {
        expect(missingText({ missing: [2, 1], extra: [0, 0], complete: false }, teams)).toBe('3 goals not found (Whites 2, Colours 1)')
        expect(missingText({ missing: [0, 1], extra: [0, 0], complete: false }, teams)).toBe('1 goal not found (Colours 1)')
    })
    it('should name the team that is over', () => {
        expect(extraText({ missing: [0, 0], extra: [1, 0], complete: false }, teams)).toBe('1 more than the final score (Whites)')
        expect(extraText({ missing: [0, 0], extra: [1, 2], complete: false }, teams)).toBe('3 more than the final score (Whites 1, Colours 2)')
    })
    it('should fall back to Team 1 / Team 2 for empty names', () => {
        const blank: Team[] = [{ ...teams[0], name: '' }, { ...teams[1], name: '' }]
        expect(missingText({ missing: [1, 0], extra: [0, 0], complete: false }, blank)).toBe('1 goal not found (Team 1 1)')
        expect(extraText({ missing: [0, 0], extra: [0, 1], complete: false }, blank)).toBe('1 more than the final score (Team 2)')
    })
})
