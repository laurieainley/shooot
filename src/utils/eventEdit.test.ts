import { describe, it, expect } from 'vitest'
import type { MatchEvent, Team } from '../types'
import { PICKER_OPTIONS } from './eventTypes'
import { optionForEvent, personEdit, typeChangePatch } from './eventEdit'

const teams: Team[] = [
    { name: 'Whites', color: '#fff', roster: ['Sam Taylor', 'Priya'] },
    { name: 'Colours', color: '#c00', roster: ['Jo Smith'] },
]
const ev = (over: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal', ...over })
const opt = (id: string) => PICKER_OPTIONS.find((o) => o.id === id)!

describe('optionForEvent', () => {
    it('should map a penalty goal to the "Goal (pen)" option and a plain goal to "Goal"', () => {
        expect(optionForEvent(ev({ pen: true })).id).toBe('goal_pen')
        expect(optionForEvent(ev({})).id).toBe('goal')
    })

    it('should find the option for every other type', () => {
        for (const type of ['own_goal', 'penalty_awarded', 'penalty_missed', 'highlight', 'foul', 'save'] as const) {
            expect(optionForEvent(ev({ type })).type).toBe(type)
        }
    })
})

describe('typeChangePatch', () => {
    it('should set the type and pen flag like the picker does', () => {
        expect(typeChangePatch(ev({}), opt('goal_pen'))).toEqual({ type: 'goal', pen: true })
        expect(typeChangePatch(ev({ pen: true }), opt('own_goal'))).toEqual({ type: 'own_goal', pen: undefined })
    })

    it('should drop the person when the new type has no person (penalty awarded)', () => {
        expect(typeChangePatch(ev({ scorer: 'Sam' }), opt('penalty_awarded'))).toEqual({ type: 'penalty_awarded', pen: undefined, scorer: undefined })
    })

    it('should keep the person when the new type has one', () => {
        expect(typeChangePatch(ev({ scorer: 'Sam' }), opt('save'))).toEqual({ type: 'save', pen: undefined })
    })
})

describe('personEdit', () => {
    it('should set a known roster name without touching the roster', () => {
        expect(personEdit(teams, ev({ team: 'Whites' }), ' Priya ')).toEqual({ patch: { scorer: 'Priya' } })
    })

    it('should add a new name to the credited team roster', () => {
        expect(personEdit(teams, ev({ team: 'Whites' }), 'Kim')).toEqual({ patch: { scorer: 'Kim' }, addToRoster: { team: 'Whites', name: 'Kim' } })
    })

    it('should add an own goal scorer to the other team', () => {
        expect(personEdit(teams, ev({ type: 'own_goal', team: 'Whites' }), 'Kim').addToRoster).toEqual({ team: 'Colours', name: 'Kim' })
    })

    it('should clear the person when the name is blank', () => {
        expect(personEdit(teams, ev({ team: 'Whites', scorer: 'Sam' }), '  ')).toEqual({ patch: { scorer: undefined } })
    })

    it('should not add to any roster when the event has no team', () => {
        expect(personEdit(teams, ev({}), 'Kim')).toEqual({ patch: { scorer: 'Kim' } })
    })
})
