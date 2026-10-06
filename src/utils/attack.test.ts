import { describe, it, expect } from 'vitest'
import { attackingSide, replayCropResolver, type AttackContext } from './attack'
import { defaultGoalAreas } from './crop'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }]
const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', ...extra })
const ctx = (extra: Partial<AttackContext> = {}): AttackContext => ({
    events: [ev({ id: 'k', type: 'kick_off', matchTimeSec: 10 })],
    teams, cumulativeOffsets: [0, 1000], whitesAttackLeft: true, areas: defaultGoalAreas(), ...extra,
})

describe('attackingSide', () => {
    it('should send the first team the way the toggle says and the other team the opposite way', () => {
        expect(attackingSide(ev({ team: 'Whites' }), ctx())).toBe('left')
        expect(attackingSide(ev({ team: 'Colours' }), ctx())).toBe('right')
        expect(attackingSide(ev({ team: 'Whites' }), ctx({ whitesAttackLeft: false }))).toBe('right')
    })
    it('should be unknown without a team or with a team that is not in the match', () => {
        expect(attackingSide(ev({}), ctx())).toBeNull()
        expect(attackingSide(ev({ team: 'Strangers' }), ctx())).toBeNull()
    })
    it('should not swap at half time when only one Kick off exists', () => {
        expect(attackingSide(ev({ team: 'Whites', matchTimeSec: 5000 }), ctx())).toBe('left')
    })
    it('should swap sides after a second Kick off (second half)', () => {
        const events = [ev({ id: 'k1', type: 'kick_off', matchTimeSec: 10 }), ev({ id: 'k2', type: 'kick_off', matchTimeSec: 3000 })]
        expect(attackingSide(ev({ team: 'Whites', matchTimeSec: 2999 }), ctx({ events }))).toBe('left')
        expect(attackingSide(ev({ team: 'Whites', matchTimeSec: 3001 }), ctx({ events }))).toBe('right')
    })
    it('should place events on the whole timeline through the file offsets', () => {
        const events = [ev({ id: 'k1', type: 'kick_off', matchTimeSec: 10 }), ev({ id: 'k2', type: 'kick_off', matchTimeSec: 500, sourceFileIndex: 1 })]
        expect(attackingSide(ev({ team: 'Whites', matchTimeSec: 900, sourceFileIndex: 0 }), ctx({ events }))).toBe('left')
        expect(attackingSide(ev({ team: 'Whites', matchTimeSec: 10, sourceFileIndex: 1 }), ctx({ events }))).toBe('left') // 1010 < 1500
        expect(attackingSide(ev({ team: 'Whites', matchTimeSec: 600, sourceFileIndex: 1 }), ctx({ events }))).toBe('right')
    })
})

describe('replayCropResolver', () => {
    const areas = defaultGoalAreas()
    it('should default to the attacking goal area of the credited team', () => {
        const crop = replayCropResolver(ctx())
        expect(crop(ev({ team: 'Whites' }))).toEqual(areas.left)
        expect(crop(ev({ team: 'Colours' }))).toEqual(areas.right)
    })
    it('should show the whole frame when the side is unknown or no areas are set', () => {
        expect(replayCropResolver(ctx())(ev({}))).toBeNull()
        expect(replayCropResolver(ctx({ areas: null }))(ev({ team: 'Whites' }))).toBeNull()
    })
    it('should follow an explicit choice', () => {
        const crop = replayCropResolver(ctx())
        expect(crop(ev({ team: 'Whites', replayCrop: 'right' }))).toEqual(areas.right)
        expect(crop(ev({ team: 'Whites', replayCrop: 'full' }))).toBeNull()
        expect(crop(ev({ replayCrop: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } }))).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    })
    it('should show the whole frame for Left / Right when no areas are set', () => {
        expect(replayCropResolver(ctx({ areas: null }))(ev({ replayCrop: 'left' }))).toBeNull()
    })
    it('should treat a custom box that covers the whole frame as no crop', () => {
        expect(replayCropResolver(ctx())(ev({ replayCrop: { x: 0, y: 0, w: 1, h: 1 } }))).toBeNull()
    })
})
