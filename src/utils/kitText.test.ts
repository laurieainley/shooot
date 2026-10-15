import { describe, it, expect } from 'vitest'
import { kitTextColor, contrastRatio } from './kitText'
import { MULTI_COLOR } from './teamColor'

describe('kitTextColor', () => {
    it('should print dark text on light kits and light text on dark kits', () => {
        expect(kitTextColor('#f5f5f5').fill).toBe(kitTextColor('#e0b100').fill)
        expect(kitTextColor('#f5f5f5').fill).toBe('#111111')
        expect(kitTextColor('#1f2a24').fill).toBe('#ffffff')
        expect(kitTextColor('#7a4fb3').fill).toBe('#ffffff')
    })
    it('should give every swatch at least 3:1 contrast (large bold text)', () => {
        for (const c of ['#f5f5f5', '#1f2a24', '#3a6ea5', '#c2364a', '#e0b100', '#2f8a4c', '#e36b1f', '#7a4fb3']) {
            expect(contrastRatio(kitTextColor(c).fill, c)).toBeGreaterThanOrEqual(3)
        }
    })
    it('should use dark text with a light stroke on the multicolour kit', () => {
        const t = kitTextColor(MULTI_COLOR)
        expect(t.fill).toBe('#111111')
        expect(t.stroke).toBe('#ffffff')
    })
    it('should fall back to dark text for unknown values', () => {
        expect(kitTextColor(undefined).fill).toBe('#111111')
        expect(kitTextColor('red').fill).toBe('#111111')
    })
})
