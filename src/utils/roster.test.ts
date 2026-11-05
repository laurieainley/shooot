import { describe, it, expect } from 'vitest'
import { parseRoster, filterRoster, rosterTeamFor, rostersFor, rosterGroups } from './roster'

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

describe('rostersFor', () => {
    const teams = [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }]

    it('should be the credited team only for normal events', () => {
        expect(rostersFor(teams, 'Whites', 'goal').map((t) => t.name)).toEqual(['Whites'])
    })
    it('should list the conceding team first, then the credited team, for an own goal', () => {
        expect(rostersFor(teams, 'Whites', 'own_goal').map((t) => t.name)).toEqual(['Colours', 'Whites'])
    })
    it('should be empty for an unknown or missing team', () => {
        expect(rostersFor(teams, undefined, 'own_goal')).toEqual([])
    })
})

describe('rosterGroups', () => {
    const teams = [{ name: 'Whites', color: '#fff', roster: ['Sandy', 'Sam'] }, { name: 'Colours', color: '#f00', roster: ['Jo', 'Alex'] }]
    it('should give each roster A–Z, the conceding team first for an own goal', () => {
        expect(rosterGroups(teams, 'Whites', 'own_goal', '')).toEqual([{ team: 'Colours', names: ['Alex', 'Jo'] }, { team: 'Whites', names: ['Sam', 'Sandy'] }])
    })
    it('should filter every group by the query', () => {
        expect(rosterGroups(teams, 'Whites', 'own_goal', 'sa')).toEqual([{ team: 'Colours', names: [] }, { team: 'Whites', names: ['Sam', 'Sandy'] }])
    })
    it('should be one group for other events', () => {
        expect(rosterGroups(teams, 'Whites', 'goal', '')).toEqual([{ team: 'Whites', names: ['Sam', 'Sandy'] }])
    })
})
