import { describe, it, expect } from 'vitest'
import { keyboardInset } from './keyboard'

describe('keyboardInset', () => {
    it('should be 0 when the visual viewport fills the layout viewport', () => {
        expect(keyboardInset({ layoutHeight: 844, viewportHeight: 844, viewportOffsetTop: 0 })).toBe(0)
    })

    it('should be the height the keyboard covers at the bottom', () => {
        expect(keyboardInset({ layoutHeight: 844, viewportHeight: 508, viewportOffsetTop: 0 })).toBe(336)
    })

    it('should account for the visual viewport being scrolled down inside the layout viewport', () => {
        expect(keyboardInset({ layoutHeight: 844, viewportHeight: 508, viewportOffsetTop: 100 })).toBe(236)
    })

    it('should ignore small differences (browser toolbars, rounding)', () => {
        expect(keyboardInset({ layoutHeight: 844, viewportHeight: 820.5, viewportOffsetTop: 0 })).toBe(0)
    })

    it('should never be negative', () => {
        expect(keyboardInset({ layoutHeight: 400, viewportHeight: 420, viewportOffsetTop: 0 })).toBe(0)
    })
})
