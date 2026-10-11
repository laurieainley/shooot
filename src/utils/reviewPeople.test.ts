import { describe, expect, it } from 'vitest'
import type { Team } from '../types'
import { NO_PEOPLE, peopleCandidates, peopleLabel, peopleOpen, reopenPeople, startPeople, stepPeople } from './reviewPeople'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: ['Sam', 'Sandy'] }, { name: 'Colours', color: '#000', roster: ['Jo'] }]

describe('startPeople', () => {
    it('should ask for goals and own goals once the team is known, and nobody else', () => {
        expect(peopleOpen(startPeople('goal', 'Whites', 2))).toBe(true)
        expect(peopleOpen(startPeople('own_goal', 'Whites', 2))).toBe(true)
        expect(startPeople('save', 'Whites', 2)).toEqual(NO_PEOPLE)
        expect(startPeople('highlight', null, 2)).toEqual(NO_PEOPLE)
        expect(startPeople('goal', null, 2)).toEqual(NO_PEOPLE)
        expect(startPeople('goal', 'Whites', 0)).toEqual(NO_PEOPLE)
    })
    it('should label the field like the picker', () => {
        expect(peopleLabel(startPeople('goal', 'Whites', 2))).toBe('Scorer')
        expect(peopleLabel(startPeople('own_goal', 'Whites', 2))).toBe('Own goal by')
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
        expect(peopleCandidates(p, teams)).toEqual(['Sam'])
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
