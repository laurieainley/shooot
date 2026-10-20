import { describe, it, expect } from 'vitest'
import { NO_FILL, nextFill } from './landscapeFill'

describe('nextFill', () => {
    it('should fill the screen when a phone turns landscape', () => {
        const r = nextFill(NO_FILL, { landscape: true, fullscreen: false })
        expect(r.action).toBe('enter')
        expect(r.mem).toEqual({ landscape: true, auto: true, suppressed: false })
    })
    it('should do nothing while it is already landscape and filled', () => {
        const a = nextFill(NO_FILL, { landscape: true, fullscreen: false }).mem
        expect(nextFill(a, { landscape: true, fullscreen: true }).action).toBeNull()
    })
    it('should leave the fill when the phone turns back to portrait', () => {
        const a = nextFill(NO_FILL, { landscape: true, fullscreen: false }).mem
        const b = nextFill(a, { landscape: true, fullscreen: true }).mem
        const r = nextFill(b, { landscape: false, fullscreen: true })
        expect(r.action).toBe('exit')
        expect(r.mem).toEqual(NO_FILL)
    })
    it('should not enter when fullscreen was already on (the user chose it in portrait), and not exit on rotating back', () => {
        const a = nextFill(NO_FILL, { landscape: true, fullscreen: true })
        expect(a.action).toBeNull()
        expect(nextFill(a.mem, { landscape: false, fullscreen: true }).action).toBeNull()
    })
    it('should stay out when the user leaves the fill while landscape, until the next rotation', () => {
        const a = nextFill(NO_FILL, { landscape: true, fullscreen: false }).mem
        const b = nextFill(a, { landscape: true, fullscreen: true }).mem
        const out = nextFill(b, { landscape: true, fullscreen: false })
        expect(out.action).toBeNull()
        expect(out.mem.suppressed).toBe(true)
        expect(nextFill(out.mem, { landscape: true, fullscreen: false }).action).toBeNull()
        const portrait = nextFill(out.mem, { landscape: false, fullscreen: false })
        expect(portrait.action).toBeNull()
        expect(nextFill(portrait.mem, { landscape: true, fullscreen: false }).action).toBe('enter')
    })
    it('should do nothing in portrait', () => {
        expect(nextFill(NO_FILL, { landscape: false, fullscreen: false }).action).toBeNull()
    })
})
