import { describe, expect, it } from 'vitest'
import type { Team } from '../types'
import { NO_PEOPLE, peopleCandidates, peopleDisabled, peopleLabel, peopleOpen, reopenPeople, startPeople, stepPeople } from './reviewPeople'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: ['Sandy', 'Sam', 'zoe', 'Bob', 'Álvaro'] }, { name: 'Colours', color: '#000', roster: ['Jo'] }]

describe('startPeople', () => {
    it('should ask for goals, own goals and saves once the team is known, and for a highlight nobody', () => {
        expect(peopleOpen(startPeople('goal', 'Whites', 2))).toBe(true)
        expect(peopleOpen(startPeople('own_goal', 'Whites', 2))).toBe(true)
        expect(peopleOpen(startPeople('save', 'Whites', 2))).toBe(true) // the keeper, as in the picker
        expect(startPeople('save', null, 2)).toEqual(NO_PEOPLE)
        expect(startPeople('highlight', null, 2)).toEqual(NO_PEOPLE)
        expect(startPeople('goal', null, 2)).toEqual(NO_PEOPLE)
        expect(startPeople('goal', 'Whites', 0)).toEqual(NO_PEOPLE)
    })
    it('should label the field like the picker', () => {
        expect(peopleLabel(startPeople('goal', 'Whites', 2))).toBe('Scorer')
        expect(peopleLabel(startPeople('own_goal', 'Whites', 2))).toBe('Own goal by')
        expect(peopleLabel(startPeople('save', 'Whites', 2))).toBe('Goalkeeper')
    })
})

describe('alphabetical lists', () => {
    it('should list names alphabetically ignoring case and accents, and keep that order when filtering', () => {
        const p = startPeople('goal', 'Whites', 2)
        expect(peopleCandidates(p, teams)).toEqual(['Álvaro', 'Bob', 'Sam', 'Sandy', 'zoe'])
        expect(peopleCandidates(stepPeople(p, { kind: 'text', value: 's' }, teams), teams)).toEqual(['Sam', 'Sandy'])
    })
    it('should skip the disabled scorer with the arrows and on Enter in the assist list', () => {
        let p = stepPeople(startPeople('goal', 'Whites', 2), { kind: 'choose', value: 'Bob' }, teams)
        expect(peopleCandidates(p, teams)).toEqual(['Álvaro', 'Bob', 'Sam', 'Sandy', 'zoe']) // Bob stays in place
        expect(p.pk?.highlighted).toBe(0)
        p = stepPeople(p, { kind: 'key', key: 'ArrowDown' }, teams)
        expect(p.pk?.highlighted).toBe(2) // skipped Bob
        p = stepPeople(p, { kind: 'key', key: 'ArrowUp' }, teams)
        expect(p.pk?.highlighted).toBe(0)
        p = stepPeople(p, { kind: 'key', key: 'ArrowUp' }, teams)
        expect(p.pk?.highlighted).toBe(4) // wrapped
        p = stepPeople(p, { kind: 'choose', value: 'Bob' }, teams) // clicking the scorer picks nothing as assist
        expect(p.assist).toBeUndefined()
    })
})

describe('stepPeople', () => {
    it('should filter the roster as you type, pick with Enter, then ask for the assist without the scorer', () => {
        let p = startPeople('goal', 'Whites', 2)
        p = stepPeople(p, { kind: 'text', value: 'sa' }, teams)
        expect(peopleCandidates(p, teams)).toEqual(['Sam', 'Sandy'])
        p = stepPeople(p, { kind: 'key', key: 'ArrowDown' }, teams)
        p = stepPeople(p, { kind: 'key', key: 'Enter' }, teams)
        expect(p.scorer).toBe('Sandy')
        expect(peopleLabel(p)).toBe('Assist')
        expect(peopleCandidates(p, teams)).toEqual(['Álvaro', 'Bob', 'Sam', 'Sandy', 'zoe']) // the scorer keeps their slot
        expect(peopleDisabled(p, 'Sandy')).toBe(true)
        expect(peopleDisabled(p, 'Sam')).toBe(false)
        p = stepPeople(p, { kind: 'choose', value: 'Sam' }, teams)
        expect(p).toMatchObject({ scorer: 'Sandy', assist: 'Sam' })
        expect(peopleOpen(p)).toBe(false)
    })
    it('should skip with Tab or Enter on an empty field, and note new names for the roster', () => {
        let p = stepPeople(startPeople('goal', 'Whites', 2), { kind: 'key', key: 'Tab' }, teams)
        expect(peopleOpen(p)).toBe(false)
        expect(p.scorer).toBeUndefined()
        p = stepPeople(startPeople('goal', 'Whites', 2), { kind: 'key', key: 'Enter' }, teams)
        expect(peopleOpen(p)).toBe(false)
        p = stepPeople(startPeople('goal', 'Whites', 2), { kind: 'choose', value: 'Newcomer' }, teams)
        expect(p.adds).toEqual([{ team: 'Whites', name: 'Newcomer' }])
        p = stepPeople(p, { kind: 'key', key: 'Tab' }, teams)
        expect(peopleOpen(p)).toBe(false)
    })
    it('should take an own goal player from the other team roster', () => {
        const p = startPeople('own_goal', 'Whites', 2)
        expect(peopleCandidates(p, teams)).toEqual(['Jo'])
    })
    it('should reopen at the scorer step with the names cleared', () => {
        let p = stepPeople(startPeople('goal', 'Whites', 2), { kind: 'choose', value: 'Sam' }, teams)
        p = reopenPeople(stepPeople(p, { kind: 'key', key: 'Tab' }, teams))
        expect(p.scorer).toBeUndefined()
        expect(peopleOpen(p)).toBe(true)
    })
})
