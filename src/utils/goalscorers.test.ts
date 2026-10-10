import { describe, it, expect } from 'vitest'
import { goalscorers, goalscorersText } from './goalscorers'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [], initials: 'whi' }, { name: 'Colours', color: '#f00', roster: [] }]
let n = 0
const g = (team: string, scorer?: string, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id: `e${++n}`, matchTimeSec: n * 10, sourceFileIndex: 0, type: 'goal', team, scorer, ...extra })

const at = (t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id: `t${t}${Math.random()}`, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })
const kick = (t: number): MatchEvent => ({ id: 'k', matchTimeSec: t, sourceFileIndex: 0, type: 'kick_off' })

describe('goalscorers', () => {
    it('should count goals (pens in brackets), most first, ties alphabetical, own goals last, no minutes', () => {
        const events = [
            kick(100),
            at(100 + 12 * 60, { team: 'Whites', scorer: 'Sam Taylor' }),
            at(100 + 20 * 60, { team: 'Colours', scorer: 'Priya' }),
            at(100 + 43 * 60 + 10, { team: 'Whites', scorer: 'Sam Taylor', pen: true }),
            at(100 + 50 * 60, { team: 'Colours', scorer: 'Alex Wu' }),
            at(100 + 60 * 60, { team: 'Whites', scorer: 'Jo Smith', assist: 'Sam Taylor' }),
            at(100 + 29 * 60, { team: 'Whites', scorer: 'Ade', type: 'own_goal' }),
            at(5, { type: 'highlight', scorer: 'Sam Taylor' }),
        ]
        expect(goalscorers(events, teams)).toEqual({
            scoreLine: 'WHI 4–2 CO',
            lines: ['Sam Taylor: 2 (1 pen)', 'Alex Wu: 1', 'Jo Smith: 1', 'Priya: 1', 'Own goals: Ade 1'],
        })
    })

    it('should say pens in the plural', () => {
        const events = [at(1, { team: 'Whites', scorer: 'Sam', pen: true }), at(2, { team: 'Whites', scorer: 'Sam', pen: true })]
        expect(goalscorers(events, teams).lines).toEqual(['Sam: 2 (2 pens)'])
    })

    it('should tally own goals per player, sorted like scorers, naming unknown ones', () => {
        const events = [
            at(60, { team: 'Colours', scorer: 'Bo', type: 'own_goal' }), at(700, { team: 'Whites', type: 'own_goal' }),
            at(800, { team: 'Whites', scorer: 'bo', type: 'own_goal' }), at(900, { team: 'Whites', scorer: 'Ade', type: 'own_goal' }),
        ]
        expect(goalscorers(events, teams).lines).toEqual(['Own goals: Bo 2, Ade 1, unknown 1'])
    })

    it('should leave out goals without a scorer and events whose file is missing', () => {
        const events = [g('Whites'), g('Colours', 'Priya', { unlinked: true })]
        expect(goalscorers(events, teams)).toEqual({ scoreLine: 'WHI 1–0 CO', lines: [] })
    })

    it('should have no score line without two named teams', () => {
        expect(goalscorers([g('Whites', 'Sam')], []).scoreLine).toBe('')
    })
})

describe('goalscorersText', () => {
    it('should put a blank line between the score and the scorers', () => {
        expect(goalscorersText([kick(0), at(60, { team: 'Whites', scorer: 'Sam' })], teams)).toBe('WHI 1–0 CO\n\nSam: 1')
    })
})

describe('goalscorersText without assists', () => {
    it('should never add an Assists section', () => {
        const events = [kick(0), at(60, { team: 'Whites', scorer: 'Sam', assist: 'Jo' })]
        expect(goalscorersText(events, teams)).toBe('WHI 1–0 CO\n\nSam: 1')
    })
})
