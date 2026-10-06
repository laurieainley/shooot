import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureGraphicsFonts, settleWithin } from './assets'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('settleWithin', () => {
    it('should resolve true when the work finishes in time, false when it fails or is too slow', async () => {
        vi.useFakeTimers()
        expect(await settleWithin(Promise.resolve(1), 1000)).toBe(true)
        expect(await settleWithin(Promise.reject(new Error('x')), 1000)).toBe(false)
        const slow = settleWithin(new Promise(() => {}), 1000)
        await vi.advanceTimersByTimeAsync(1001)
        expect(await slow).toBe(false)
    })
})

describe('ensureGraphicsFonts', () => {
    it('should load the display font for the characters the graphics draw before returning', async () => {
        const load = vi.fn().mockResolvedValue([])
        vi.stubGlobal('document', { fonts: { load, add: vi.fn() } })
        class Face { load = vi.fn().mockResolvedValue(this) }
        vi.stubGlobal('FontFace', Face)
        expect(await ensureGraphicsFonts()).toBe(true)
        expect(load).toHaveBeenCalledWith(expect.stringContaining('Bebas Neue'), expect.stringContaining('GOAL'))
    })

    it('should give up after its timeout, not hang, when the font never loads', async () => {
        vi.useFakeTimers()
        vi.stubGlobal('document', { fonts: { load: () => new Promise(() => {}), add: vi.fn() } })
        class Face { load = () => new Promise(() => {}) }
        vi.stubGlobal('FontFace', Face)
        const p = ensureGraphicsFonts(500)
        await vi.advanceTimersByTimeAsync(600)
        expect(await p).toBe(false)
    })
})
