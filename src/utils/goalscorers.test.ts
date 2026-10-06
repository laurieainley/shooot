import { describe, it, expect } from 'vitest'
import { goalscorers, goalscorersText } from './goalscorers'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }]
let n = 0
const g = (team: string, scorer?: string, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id: `e${++n}`, matchTimeSec: n * 10, sourceFileIndex: 0, type: 'goal', team, scorer, ...extra })

describe('goalscorers', () => {
    it('should give the score line and scorers by goals, ties alphabetical, pens marked, own goals last', () => {
        const events = [
            g('Whites', 'Sam Taylor'), g('Colours', 'Priya'), g('Whites', 'Sam Taylor', { pen: true }),
            g('Colours', 'Alex Wu'), g('Whites', 'Jo Smith'),
            g('Whites', 'Ade', { type: 'own_goal' }),
            { id: 'h', matchTimeSec: 5, sourceFileIndex: 0, type: 'highlight', scorer: 'Sam Taylor' } as MatchEvent,
            { id: 'k', matchTimeSec: 1, sourceFileIndex: 0, type: 'kick_off' } as MatchEvent,
        ]
        expect(goalscorers(events, teams)).toEqual({
            scoreLine: 'Whites 4–2 Colours',
            lines: ['Sam Taylor 2 (1 pen)', 'Alex Wu 1', 'Jo Smith 1', 'Priya 1', 'Own goals: Ade (for Whites)'],
        })
    })

    it('should count the penalties of a scorer in the plural', () => {
        const events = [g('Whites', 'Sam', { pen: true }), g('Whites', 'Sam', { pen: true })]
        expect(goalscorers(events, teams).lines).toEqual(['Sam 2 (2 pens)'])
    })

    it('should list several own goals, naming unknown ones', () => {
        const events = [g('Colours', 'Bo', { type: 'own_goal' }), g('Whites', undefined, { type: 'own_goal' })]
        expect(goalscorers(events, teams).lines).toEqual(['Own goals: Bo (for Colours), unknown (for Whites)'])
    })

    it('should leave out goals without a scorer and events whose file is missing', () => {
        const events = [g('Whites'), g('Colours', 'Priya', { unlinked: true })]
        expect(goalscorers(events, teams)).toEqual({ scoreLine: 'Whites 1–0 Colours', lines: [] })
    })

    it('should have no score line without two named teams', () => {
        expect(goalscorers([g('Whites', 'Sam')], []).scoreLine).toBe('')
    })
})

describe('goalscorersText', () => {
    it('should put a blank line between the score and the scorers', () => {
        expect(goalscorersText([g('Whites', 'Sam')], teams)).toBe('Whites 1–0 Colours\n\nSam 1')
    })
})
