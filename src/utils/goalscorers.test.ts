import { describe, it, expect } from 'vitest'
import { goalscorers, goalscorersText } from './goalscorers'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }]
let n = 0
const g = (team: string, scorer?: string, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id: `e${++n}`, matchTimeSec: n * 10, sourceFileIndex: 0, type: 'goal', team, scorer, ...extra })

const at = (t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id: `t${t}${Math.random()}`, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })
const kick = (t: number): MatchEvent => ({ id: 'k', matchTimeSec: t, sourceFileIndex: 0, type: 'kick_off' })

describe('goalscorers', () => {
    it('should list minutes from the match clock, most goals first, ties alphabetical, pens marked, own goals last', () => {
        const events = [
            kick(100),
            at(100 + 12 * 60, { team: 'Whites', scorer: 'Sam Taylor' }),
            at(100 + 20 * 60, { team: 'Colours', scorer: 'Priya' }),
            at(100 + 43 * 60 + 10, { team: 'Whites', scorer: 'Sam Taylor', pen: true }),
            at(100 + 50 * 60, { team: 'Colours', scorer: 'Alex Wu' }),
            at(100 + 60 * 60, { team: 'Whites', scorer: 'Jo Smith' }),
            at(100 + 29 * 60, { team: 'Whites', scorer: 'Ade', type: 'own_goal' }),
            at(5, { type: 'highlight', scorer: 'Sam Taylor' }),
        ]
        expect(goalscorers(events, teams)).toEqual({
            scoreLine: 'Whites 4–2 Colours',
            lines: [
                "Sam Taylor: 2 ('13, '44 pen)", "Alex Wu: 1 ('51)", "Jo Smith: 1 ('61)", "Priya: 1 ('21)",
                "Own goals: Ade ('30, for Whites)",
            ],
        })
    })

    it('should put each scorer\'s goals in time order whatever the event order', () => {
        const events = [kick(0), at(3000, { team: 'Whites', scorer: 'Sam' }), at(600, { team: 'Whites', scorer: 'Sam' })]
        expect(goalscorers(events, teams).lines).toEqual(["Sam: 2 ('11, '51)"])
    })

    it('should place events on the whole timeline through the file offsets', () => {
        const events = [kick(0), at(60, { team: 'Whites', scorer: 'Sam', sourceFileIndex: 1 })]
        expect(goalscorers(events, teams, [0, 1200]).lines).toEqual(["Sam: 1 ('22)"])
    })

    it('should count from the start of the first file when Kick off is not marked', () => {
        expect(goalscorers([at(125, { team: 'Whites', scorer: 'Sam' })], teams).lines).toEqual(["Sam: 1 ('3)"])
    })

    it('should list several own goals, naming unknown ones', () => {
        const events = [kick(0), at(60, { team: 'Colours', scorer: 'Bo', type: 'own_goal' }), at(700, { team: 'Whites', type: 'own_goal' })]
        expect(goalscorers(events, teams).lines).toEqual(["Own goals: Bo ('2, for Colours), unknown ('12, for Whites)"])
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
        expect(goalscorersText([kick(0), at(60, { team: 'Whites', scorer: 'Sam' })], teams)).toBe("Whites 1–0 Colours\n\nSam: 1 ('2)")
    })
})
