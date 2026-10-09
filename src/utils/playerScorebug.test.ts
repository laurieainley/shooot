import { describe, it, expect } from 'vitest'
import { scorebugModel } from './playerScorebug'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [
    { name: "Ryan's Rovers", color: '#3a6ea5', roster: [] },
    { name: 'Whites', color: 'multi', roster: [], initials: 'wx' },
]
const ko: MatchEvent = { id: 'ko', matchTimeSec: 100, sourceFileIndex: 0, type: 'kick_off' }
const goal = (id: string, t: number, team: string): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', team })

describe('scorebugModel', () => {
    it('should be null without two named teams', () => {
        expect(scorebugModel({ teams: [], events: [], offsets: [0], playheadSec: 0, clockLong: false })).toBeNull()
        expect(scorebugModel({ teams: [teams[0]], events: [], offsets: [0], playheadSec: 0, clockLong: false })).toBeNull()
        expect(scorebugModel({ teams: [{ ...teams[0], name: ' ' }, { ...teams[1], name: '' }], events: [], offsets: [0], playheadSec: 0, clockLong: false })).toBeNull()
    })

    it('should use initials, colours and the score at the playhead', () => {
        const m = scorebugModel({ teams, events: [ko, goal('a', 200, "Ryan's Rovers"), goal('b', 400, 'Whites')], offsets: [0], playheadSec: 300, clockLong: false })
        expect(m).toMatchObject({ left: { initials: 'RR', color: '#3a6ea5' }, right: { initials: 'WX', color: 'multi' }, score: '1–0' })
    })

    it('should show the match clock from kick-off, and none before it or without one', () => {
        const base = { teams, offsets: [0], clockLong: false }
        expect(scorebugModel({ ...base, events: [ko], playheadSec: 165 })?.clock).toBe('01:05')
        expect(scorebugModel({ ...base, events: [ko], playheadSec: 50 })?.clock).toBeNull()
        expect(scorebugModel({ ...base, events: [], playheadSec: 165 })?.clock).toBeNull()
    })

    it('should describe full names and the final score in the label', () => {
        const m = scorebugModel({ teams, events: [ko, goal('a', 200, 'Whites')], offsets: [0], playheadSec: 0, clockLong: false })
        expect(m?.label).toBe("Ryan's Rovers 0–0 Whites (final 0–1)")
    })
})
