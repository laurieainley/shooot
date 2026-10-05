import { describe, it, expect } from 'vitest'
import { nextBarVisible } from './barScroll'

describe('nextBarVisible', () => {
    it('should always show the bar near the top of the page', () => {
        expect(nextBarVisible(false, 300, 40)).toBe(true)
        expect(nextBarVisible(false, 10, 30)).toBe(true)
    })

    it('should hide the bar when scrolling down past the threshold', () => {
        expect(nextBarVisible(true, 200, 220)).toBe(false)
    })

    it('should show the bar again when scrolling up past the threshold', () => {
        expect(nextBarVisible(false, 400, 380)).toBe(true)
    })

    it('should ignore jitter smaller than the threshold', () => {
        expect(nextBarVisible(true, 200, 205)).toBe(true)
        expect(nextBarVisible(false, 400, 396)).toBe(false)
    })
})
