import { describe, it, expect } from 'vitest'
import { centredBaseline, clampInto } from './paint'

describe('centredBaseline', () => {
    it('should put the ink box (ascent above, descent below the baseline) centred on the given y', () => {
        // ascent 30, descent 0: the baseline sits 15 below the centre
        expect(centredBaseline(100, 30, 0)).toBe(115)
        // ascent 30, descent 10: ink spans baseline-30 .. baseline+10, centre = baseline-10
        expect(centredBaseline(100, 30, 10)).toBe(110)
        expect(centredBaseline(100, 20, 20)).toBe(100)
    })
})

describe('clampInto', () => {
    const box = { x: 0, y: 0, w: 100, h: 50 }
    it('should leave a rectangle that fits where it is', () => {
        expect(clampInto(box, { x: 10, y: 10, w: 20, h: 20 })).toEqual({ x: 10, y: 10, w: 20, h: 20 })
    })
    it('should pull a rectangle poking out of the bottom back inside', () => {
        expect(clampInto(box, { x: 10, y: 40, w: 20, h: 20 })).toEqual({ x: 10, y: 30, w: 20, h: 20 })
    })
    it('should shrink a rectangle larger than the box, keeping its aspect ratio and centring it', () => {
        expect(clampInto(box, { x: -20, y: -20, w: 200, h: 100 })).toEqual({ x: 0, y: 0, w: 100, h: 50 })
        const r = clampInto(box, { x: 0, y: 0, w: 100, h: 100 })
        expect(r).toEqual({ x: 25, y: 0, w: 50, h: 50 })
    })
})

