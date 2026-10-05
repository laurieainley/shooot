import { describe, it, expect } from 'vitest'
import { autoInitials, inkFor, NAVY, teamBadge } from './teamStyle'

describe('autoInitials', () => {
    it('should take the first letters of up to two words', () => {
        expect(autoInitials("Ryan's Rovers")).toBe('RR')
        expect(autoInitials('Walford Town')).toBe('WT')
        expect(autoInitials('FC United of Manchester')).toBe('FU')
    })

    it('should take two letters of a single word', () => {
        expect(autoInitials('Whites')).toBe('WH')
        expect(autoInitials('colours')).toBe('CO')
    })

    it('should ignore punctuation and fall back for empty names', () => {
        expect(autoInitials('  ')).toBe('?')
        expect(autoInitials('A.F.C. Wimbledon')).toBe('AW')
    })
})

describe('inkFor', () => {
    it('should use navy on light kits and white on dark or saturated ones', () => {
        expect(inkFor('#f0f0f0')).toBe(NAVY)
        expect(inkFor('#e0b100')).toBe(NAVY)
        expect(inkFor('#ec5fa4')).toBe('#ffffff')
        expect(inkFor('#1f2a24')).toBe('#ffffff')
    })
})

describe('teamBadge', () => {
    it('should upper-case the name and prefer explicit initials', () => {
        expect(teamBadge({ name: "Ryan's Rovers", color: '#f0f0f0', roster: [] })).toEqual({ name: "RYAN'S ROVERS", initials: 'RR', colour: '#f0f0f0', ink: NAVY })
        expect(teamBadge({ name: 'Colours', color: '#ec5fa4', roster: [], initials: 'wt ' })).toMatchObject({ initials: 'WT', ink: '#ffffff' })
    })
})
