import { describe, it, expect } from 'vitest'
import { pickLayout } from './useMediaQuery'

const none = { landscapePhone: false, tablet: false, portrait: false, desktop: false }

describe('pickLayout', () => {
    it('should use the stacked phone layout by default and the bay on wide screens', () => {
        expect(pickLayout(none)).toBe('phone')
        expect(pickLayout({ ...none, desktop: true })).toBe('desktop')
    })

    it('should treat a short landscape screen as a phone on its side, whatever its width', () => {
        expect(pickLayout({ ...none, landscapePhone: true, desktop: true })).toBe('landscape')
        expect(pickLayout({ ...none, landscapePhone: true })).toBe('landscape')
    })

    it('should give a touch tablet the edit bay on its side and the tall stacked layout upright', () => {
        expect(pickLayout({ ...none, tablet: true, desktop: true })).toBe('desktop')
        expect(pickLayout({ ...none, tablet: true, desktop: false })).toBe('desktop')
        expect(pickLayout({ ...none, tablet: true, portrait: true, desktop: true })).toBe('tablet')
        expect(pickLayout({ ...none, tablet: true, portrait: true })).toBe('tablet')
    })

    it('should not stack a mouse-driven window just because it is portrait', () => {
        expect(pickLayout({ ...none, portrait: true, desktop: true })).toBe('desktop')
        expect(pickLayout({ ...none, portrait: true })).toBe('phone')
    })
})
