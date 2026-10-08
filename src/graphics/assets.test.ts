import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureGraphicsFonts, settleWithin } from './assets'
import { getTheme } from './themes'

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
    it('should load only the chosen theme fonts (Classic: Bebas Neue and no Shooot faces)', async () => {
        vi.resetModules()
        const fresh = await import('./assets')
        const themes = await import('./themes')
        const load = vi.fn().mockResolvedValue([])
        vi.stubGlobal('document', { fonts: { load, add: vi.fn() } })
        const families: string[] = []
        class Face { constructor(family: string) { families.push(family) } load = vi.fn().mockResolvedValue(this) }
        vi.stubGlobal('FontFace', Face)
        expect(await fresh.ensureGraphicsFonts(themes.getTheme('classic'))).toBe(true)
        expect(families).toEqual(['Bebas Neue', 'Bebas Neue'])
        expect(load).toHaveBeenCalledWith(expect.stringContaining('Bebas Neue'), expect.any(String))
        expect(load).not.toHaveBeenCalledWith(expect.stringContaining('Shooot'), expect.anything())
    })

    it('should load every brand voice for the characters the graphics draw before returning', async () => {
        const load = vi.fn().mockResolvedValue([])
        const add = vi.fn()
        vi.stubGlobal('document', { fonts: { load, add } })
        const families: string[] = []
        class Face { constructor(family: string) { families.push(family) } load = vi.fn().mockResolvedValue(this) }
        vi.stubGlobal('FontFace', Face)
        expect(await ensureGraphicsFonts(getTheme('shooot'))).toBe(true)
        expect(families.sort()).toEqual(['Shooot Heading', 'Shooot Mono', 'Shooot Scoreboard', 'Shooot Shirt', 'Shooot Stadium'])
        expect(add).toHaveBeenCalledTimes(5)
        for (const f of families) expect(load).toHaveBeenCalledWith(expect.stringContaining(`"${f}"`), expect.stringContaining('GOAL'))
    })

    it('should report failure, and try again next time, when one voice cannot load', async () => {
        vi.stubGlobal('document', { fonts: { load: vi.fn(), add: vi.fn() } })
        class Face { load = vi.fn().mockRejectedValue(new Error('404')) }
        vi.stubGlobal('FontFace', Face)
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.resetModules() // a fresh module: the earlier test left the fonts cached as loaded
        const fresh = await import('./assets')
        expect(await fresh.ensureGraphicsFonts(getTheme('shooot'))).toBe(false)
    })

    it('should give up after its timeout, not hang, when the font never loads', async () => {
        vi.useFakeTimers()
        vi.stubGlobal('document', { fonts: { load: () => new Promise(() => {}), add: vi.fn() } })
        class Face { load = () => new Promise(() => {}) }
        vi.stubGlobal('FontFace', Face)
        const p = ensureGraphicsFonts(getTheme('shooot'), 500)
        await vi.advanceTimersByTimeAsync(600)
        expect(await p).toBe(false)
    })
})
