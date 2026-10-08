import { describe, it, expect } from 'vitest'
import { MULTI_COLOR, MULTI_STRIPES, isMultiColor, solidTeamColor, teamBackground } from './teamColor'

describe('teamBackground', () => {
    it('should pass a plain colour through', () => {
        expect(teamBackground('#c2364a')).toBe('#c2364a')
    })
    it('should draw the multicolour kit as diagonal stripes of every stripe colour', () => {
        const css = teamBackground(MULTI_COLOR)
        expect(css).toMatch(/^linear-gradient\(135deg/)
        for (const c of MULTI_STRIPES) expect(css).toContain(c)
    })
    it('should use the fallback without a colour', () => {
        expect(teamBackground(undefined)).toBe('var(--sh-muted)')
        expect(teamBackground('', 'red')).toBe('red')
    })
})

describe('solidTeamColor', () => {
    it('should keep a colour and replace multi or nothing with the fallback', () => {
        expect(solidTeamColor('#fff', 'x')).toBe('#fff')
        expect(solidTeamColor('multi', 'x')).toBe('x')
        expect(solidTeamColor(undefined, 'x')).toBe('x')
        expect(isMultiColor('multi')).toBe(true)
        expect(isMultiColor('#fff')).toBe(false)
    })
})
