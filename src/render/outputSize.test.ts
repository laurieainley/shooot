import { describe, it, expect } from 'vitest'
import { coverRect, mixedSizeNotice, sizeLabel } from './outputSize'

describe('coverRect', () => {
    it('should use the whole source when the aspect matches', () => {
        expect(coverRect(3840, 2160, 1920, 1080)).toEqual({ sx: 0, sy: 0, sw: 3840, sh: 2160 })
    })

    it('should centre-crop the sides of a wider source', () => {
        expect(coverRect(2000, 1000, 1000, 1000)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 })
    })

    it('should centre-crop top and bottom of a taller source', () => {
        expect(coverRect(1000, 2000, 1000, 1000)).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 })
    })

    it('should cover the crop box, not the whole frame, when a replay crop is set', () => {
        const r = coverRect(3840, 2160, 1920, 1080, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
        expect(r).toEqual({ sx: 1920, sy: 1080, sw: 1920, sh: 1080 })
    })
})

describe('mixedSizeNotice', () => {
    it('should name the file, both sizes and an estimate', () => {
        const n = mixedSizeNotice([{ name: 'GX020227.MP4', width: 3840, height: 2160, seconds: 600 }], 1920, 1080)
        expect(n).toMatch(/GX020227\.MP4 is 3840×2160/)
        expect(n).toMatch(/scaled to 1920×1080/)
        expect(n).toMatch(/about \d+ min/)
    })

    it('should say a few seconds for short renders and list several files', () => {
        const n = mixedSizeNotice([{ name: 'A.MP4', width: 3840, height: 2160, seconds: 20 }, { name: 'B.MP4', width: 2704, height: 1520, seconds: 10 }], 1920, 1080)
        expect(n).toMatch(/A\.MP4 is 3840×2160/)
        expect(n).toMatch(/B\.MP4 is 2704×1520/)
        expect(n).toMatch(/about \d+ s/)
    })
})

describe('sizeLabel', () => {
    it('should format sizes with a multiplication sign', () => {
        expect(sizeLabel(1920, 1080)).toBe('1920×1080')
    })
})
