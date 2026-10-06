import { describe, it, expect } from 'vitest'
import { replayCropResolver, replayGoalFor, teamGoalLabel, type AttackContext } from './attack'
import { defaultGoalAreas } from './crop'
import type { EventType, MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }]
const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', ...extra })
const ctx = (extra: Partial<AttackContext> = {}): AttackContext => ({
    events: [ev({ id: 'k', type: 'kick_off', matchTimeSec: 10 })],
    teams, cumulativeOffsets: [0, 1000], areas: defaultGoalAreas(), ...extra,
})
const at = (type: EventType, team: string | undefined, timeSec = 100, half: number | null = null) => replayGoalFor({ type, team, timeSec }, teams, half)

describe('replayGoalFor', () => {
    it('should zoom a goal to the goal the other team defends', () => {
        expect(at('goal', 'Whites')).toBe('team2')
        expect(at('goal', 'Colours')).toBe('team1')
    })
    it('should treat missed penalties like goals', () => {
        expect(at('penalty_missed', 'Whites')).toBe('team2')
        expect(at('penalty_missed', 'Colours')).toBe('team1')
    })
    it('should send a conceded penalty to the conceding team\'s own goal (where it is taken)', () => {
        expect(at('penalty_conceded', 'Whites')).toBe('team1')
        expect(at('penalty_conceded', 'Colours')).toBe('team2')
        expect(at('penalty_conceded', 'Whites', 500, 400)).toBe('team2')
    })
    it('should send an own goal to the goal the credited team attacks', () => {
        expect(at('own_goal', 'Whites')).toBe('team2')
        expect(at('own_goal', 'Colours')).toBe('team1')
    })
    it('should send a save to the saving team\'s own goal', () => {
        expect(at('save', 'Whites')).toBe('team1')
        expect(at('save', 'Colours')).toBe('team2')
    })
    it('should use the full frame for fouls, highlights and markers', () => {
        expect(at('foul', 'Whites')).toBe('full')
        expect(at('highlight', 'Colours')).toBe('full')
        expect(at('kick_off', undefined)).toBe('full')
    })
    it('should use the full frame without a known team', () => {
        expect(at('goal', undefined)).toBe('full')
        expect(at('goal', 'Strangers')).toBe('full')
        expect(at('save', undefined)).toBe('full')
    })
    it('should swap the ends from Half time on, and not before', () => {
        expect(at('goal', 'Whites', 2999, 3000)).toBe('team2')
        expect(at('goal', 'Whites', 3000, 3000)).toBe('team1')
        expect(at('save', 'Whites', 3500, 3000)).toBe('team2')
        expect(at('goal', 'Colours', 3500, 3000)).toBe('team2')
    })
    it('should not assume halves without a Half time marker', () => {
        expect(at('goal', 'Whites', 99999, null)).toBe('team2')
    })
})

describe('replayCropResolver', () => {
    const areas = defaultGoalAreas()
    it('should default to the goal for the event type', () => {
        const crop = replayCropResolver(ctx())
        expect(crop(ev({ team: 'Whites' }))).toEqual(areas.team2)
        expect(crop(ev({ team: 'Colours' }))).toEqual(areas.team1)
        expect(crop(ev({ team: 'Whites', type: 'save' }))).toEqual(areas.team1)
    })
    it('should swap ends after a Half time marker, also across files', () => {
        const events = [ev({ id: 'h', type: 'half_time', matchTimeSec: 500, sourceFileIndex: 1 })]
        const crop = replayCropResolver(ctx({ events }))
        expect(crop(ev({ team: 'Whites', matchTimeSec: 900, sourceFileIndex: 0 }))).toEqual(areas.team2)
        expect(crop(ev({ team: 'Whites', matchTimeSec: 10, sourceFileIndex: 1 }))).toEqual(areas.team2) // 1010 < 1500
        expect(crop(ev({ team: 'Whites', matchTimeSec: 600, sourceFileIndex: 1 }))).toEqual(areas.team1)
    })
    it('should ignore a second Kick off (no halves are assumed from it)', () => {
        const events = [ev({ id: 'k1', type: 'kick_off', matchTimeSec: 10 }), ev({ id: 'k2', type: 'kick_off', matchTimeSec: 3000 })]
        expect(replayCropResolver(ctx({ events }))(ev({ team: 'Whites', matchTimeSec: 3001 }))).toEqual(areas.team2)
    })
    it('should show the whole frame when the goal is unknown or no areas are set', () => {
        expect(replayCropResolver(ctx())(ev({}))).toBeNull()
        expect(replayCropResolver(ctx())(ev({ type: 'foul', team: 'Whites' }))).toBeNull()
        expect(replayCropResolver(ctx({ areas: null }))(ev({ team: 'Whites' }))).toBeNull()
    })
    it('should follow an explicit choice', () => {
        const crop = replayCropResolver(ctx())
        expect(crop(ev({ team: 'Whites', replayCrop: 'team1' }))).toEqual(areas.team1)
        expect(crop(ev({ team: 'Whites', replayCrop: 'full' }))).toBeNull()
        expect(crop(ev({ replayCrop: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } }))).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    })
    it('should show the whole frame for a team goal when no areas are set', () => {
        expect(replayCropResolver(ctx({ areas: null }))(ev({ replayCrop: 'team1' }))).toBeNull()
    })
    it('should treat a custom box that covers the whole frame as no crop', () => {
        expect(replayCropResolver(ctx())(ev({ replayCrop: { x: 0, y: 0, w: 1, h: 1 } }))).toBeNull()
    })
})

describe('teamGoalLabel', () => {
    it('should name the goal after the team', () => {
        expect(teamGoalLabel(teams, 'team1')).toBe("Whites' goal")
        expect(teamGoalLabel([{ name: 'Reds', color: '', roster: [] }, { name: 'Blue', color: '', roster: [] }], 'team2')).toBe("Blue's goal")
    })
    it('should default to Team 1 / Team 2', () => {
        expect(teamGoalLabel([], 'team1')).toBe("Team 1's goal")
        expect(teamGoalLabel([{ name: ' ', color: '', roster: [] }, { name: '', color: '', roster: [] }], 'team2')).toBe("Team 2's goal")
    })
})
