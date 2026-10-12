import { describe, it, expect } from 'vitest'
import { deriveInitials } from './initials'

describe('deriveInitials', () => {
    it('should take the first two letters of a single word', () => {
        expect(deriveInitials('Whites')).toBe('WH')
        expect(deriveInitials('colours')).toBe('CO')
        expect(deriveInitials('X')).toBe('X')
    })
    it('should take the first letter of each of two words', () => {
        expect(deriveInitials("Ryan's Rovers")).toBe('RR')
        expect(deriveInitials('Walford Town')).toBe('WT')
    })
    it('should take at most three letters from three or more words', () => {
        expect(deriveInitials('Real Madrid CF')).toBe('RMC')
        expect(deriveInitials('FC United of Manchester')).toBe('FUO')
    })
    it('should ignore punctuation and extra spaces', () => {
        expect(deriveInitials('  A.F.C.   Wimbledon ')).toBe('AW')
    })
    it('should give an empty string for a blank name', () => {
        expect(deriveInitials('   ')).toBe('')
    })
})
