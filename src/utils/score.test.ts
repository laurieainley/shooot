import { describe, it, expect } from 'vitest'
import { finalScore, formatScore, scoreAt, scoresAfter } from './score'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [
    { name: 'Whites', color: '#fff', roster: [] },
    { name: 'Colours', color: '#f00', roster: [] },
]
let n = 0
const ev = (matchTimeSec: number, extra: Partial<MatchEvent>): MatchEvent => ({ id: `e${++n}`, matchTimeSec, type: 'goal', ...extra })

describe('scoreAt', () => {
    const events = [
        ev(100, { team: 'Whites' }),
        ev(200, { type: 'own_goal', team: 'Colours', scorer: 'Sam' }),
        ev(250, { type: 'highlight', team: 'Whites' }),
        ev(300, { team: 'Whites', pen: true }),
    ]

    it('should be 0–0 before kick-off and before the first goal', () => {
        expect(scoreAt(events, teams, [0], 0)).toEqual([0, 0])
        expect(scoreAt(events, teams, [0], 99.9)).toEqual([0, 0])
    })

    it('should count goals up to and including the playhead, own goals for the credited team', () => {
        expect(scoreAt(events, teams, [0], 100)).toEqual([1, 0])
        expect(scoreAt(events, teams, [0], 250)).toEqual([1, 1])
        expect(scoreAt(events, teams, [0], 9999)).toEqual([2, 1])
    })

    it('should skip unlinked events and teams not in Match setup', () => {
        const extra = [...events, ev(10, { team: 'Colours', unlinked: true }), ev(20, { team: 'Reds' })]
        expect(scoreAt(extra, teams, [0], 9999)).toEqual([2, 1])
    })

    it('should place events on the whole timeline using file offsets', () => {
        const multi = [ev(50, { team: 'Colours', sourceFileIndex: 1 }), ev(500, { team: 'Whites', sourceFileIndex: 0 })]
        expect(scoreAt(multi, teams, [0, 600], 599)).toEqual([1, 0])
        expect(scoreAt(multi, teams, [0, 600], 650)).toEqual([1, 1])
    })

    it('should be 0–0 with fewer than two teams', () => {
        expect(scoreAt(events, [teams[0]], [0], 9999)).toEqual([0, 0])
    })
})

describe('finalScore', () => {
    it('should count every linked scoring event', () => {
        const events = [ev(10, { team: 'Colours' }), ev(20, { team: 'Colours', unlinked: true }), ev(30, { type: 'own_goal', team: 'Whites' })]
        expect(finalScore(events, teams)).toEqual([1, 1])
    })
})

describe('scoresAfter', () => {
    it('should give each scoring event the score after it, in timeline order regardless of list order', () => {
        const a = ev(300, { team: 'Whites' })
        const b = ev(100, { team: 'Colours' })
        const c = ev(200, { type: 'highlight', team: 'Whites' })
        const d = ev(50, { team: 'Whites', sourceFileIndex: 1 })
        const map = scoresAfter([a, b, c, d], teams, [0, 1000])
        expect(map.get(b.id)).toEqual([0, 1])
        expect(map.get(a.id)).toEqual([1, 1])
        expect(map.get(d.id)).toEqual([2, 1])
        expect(map.has(c.id)).toBe(false)
    })
})

describe('formatScore', () => {
    it('should use an en dash', () => {
        expect(formatScore([3, 2])).toBe('3–2')
    })
})
