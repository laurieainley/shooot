import { describe, it, expect } from 'vitest'
import { startInFile, homeTarget } from './markers'


describe('startInFile', () => {
    it('should locate the global start inside the right file', () => {
        expect(startInFile(150, [0, 100], 1, 100)).toBe(50)
        expect(startInFile(150, [0, 100], 0, 100)).toBeNull()
        expect(startInFile(0, [0], 0, 100)).toBe(0)
    })
})

describe('homeTarget', () => {
    it('should jump to the match start, then to 0 on a second press', () => {
        expect(homeTarget(300, 120)).toBe(120)
        expect(homeTarget(120.2, 120)).toBe(0)
        expect(homeTarget(60, 120)).toBe(0)
        expect(homeTarget(300, null)).toBe(0)
    })
})
