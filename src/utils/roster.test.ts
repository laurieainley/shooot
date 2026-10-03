import { describe, it, expect } from 'vitest'
import { parseRoster, filterRoster, teamShortcuts, rosterTeamFor } from './roster'

describe('parseRoster', () => {
    it('should split on newlines and commas, strip list markers, trim and de-dupe', () => {
        const text = '1. Sam Taylor\n- Jo Bloggs\n• Alex Wu, sam taylor\n\n  Priya  \n2) Chris'
        expect(parseRoster(text)).toEqual(['Sam Taylor', 'Jo Bloggs', 'Alex Wu', 'Priya', 'Chris'])
    })
})

describe('filterRoster', () => {
    const roster = ['Sam Taylor', 'Sandy Wu', 'Alex Samson', 'Jo']
    it('should return everything for an empty query', () => {
        expect(filterRoster(roster, '')).toEqual(roster)
    })
    it('should match any word prefix, case-insensitively, keeping roster order', () => {
        expect(filterRoster(roster, 'sa')).toEqual(['Sam Taylor', 'Sandy Wu', 'Alex Samson'])
        expect(filterRoster(roster, 'WU')).toEqual(['Sandy Wu'])
        expect(filterRoster(roster, 'sam t')).toEqual(['Sam Taylor'])
    })
})

describe('teamShortcuts', () => {
    it('should use first letters when they differ', () => {
        expect(teamShortcuts(['Whites', 'Colours'])).toEqual(['w', 'c'])
    })
    it('should use the first differing position when first letters clash', () => {
        expect(teamShortcuts(['Reds', 'Rovers'])).toEqual(['e', 'o'])
    })
    it('should fall back to 1/2 for identical names', () => {
        expect(teamShortcuts(['Team', 'team'])).toEqual(['1', '2'])
    })
})

describe('rosterTeamFor', () => {
    const teams = [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }]

    it('should return the credited team for normal scoring events', () => {
        expect(rosterTeamFor(teams, 'Whites', 'goal')?.name).toBe('Whites')
    })

    it('should return the other team for an own goal', () => {
        expect(rosterTeamFor(teams, 'Whites', 'own_goal')?.name).toBe('Colours')
    })

    it('should return undefined for an unknown or missing team', () => {
        expect(rosterTeamFor(teams, undefined, 'goal')).toBeUndefined()
        expect(rosterTeamFor(teams, 'Reds', 'goal')).toBeUndefined()
    })
})
