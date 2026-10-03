import { describe, it, expect } from 'vitest'
import { seekStepFor, frameStepTime, DEFAULT_FPS } from './hotkeys'

describe('seekStepFor', () => {
    it('should seek 5 s normally and 1 s with Shift', () => {
        expect(seekStepFor({ shiftKey: false })).toBe(5)
        expect(seekStepFor({ shiftKey: true })).toBe(1)
    })
})

describe('frameStepTime', () => {
    it('should land in the middle of the next frame', () => {
        expect(frameStepTime(0, 1, 30)).toBeCloseTo(1.5 / 30)
        expect(frameStepTime(1.5 / 30, 1, 30)).toBeCloseTo(2.5 / 30)
    })

    it('should step back one frame', () => {
        expect(frameStepTime(2.5 / 30, -1, 30)).toBeCloseTo(1.5 / 30)
    })

    it('should clamp to 0 and duration', () => {
        expect(frameStepTime(0, -1, 30)).toBe(0)
        expect(frameStepTime(9.99, 1, 30, 10)).toBe(10)
    })

    it('should default to 29.97 fps', () => {
        expect(DEFAULT_FPS).toBeCloseTo(29.97, 2)
        expect(frameStepTime(0, 1)).toBeCloseTo(1.5 / DEFAULT_FPS)
    })
})
