import { describe, it, expect } from 'vitest'
import { fullscreenSplit } from './fullscreenUi'

describe('fullscreenSplit', () => {
    const base = { inFullscreen: true, coarse: true, tagging: false, columnPanel: null as 'review' | 'other' | null }
    it('should leave the picture whole when nothing is open', () => {
        expect(fullscreenSplit(base)).toBe(false)
    })
    it('should shrink the picture while a column panel is visible in touch fullscreen', () => {
        expect(fullscreenSplit({ ...base, columnPanel: 'review' })).toBe(true)
        expect(fullscreenSplit({ ...base, columnPanel: 'other' })).toBe(true)
    })
    it('should shrink the picture while the tag box is open', () => {
        expect(fullscreenSplit({ ...base, tagging: true })).toBe(true)
    })
    it('should never split outside fullscreen or with a mouse', () => {
        expect(fullscreenSplit({ ...base, inFullscreen: false, columnPanel: 'review', tagging: true })).toBe(false)
        expect(fullscreenSplit({ ...base, coarse: false, columnPanel: 'review', tagging: true })).toBe(false)
    })
})
