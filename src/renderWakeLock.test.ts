import { describe, it, expect, vi } from 'vitest'
import { createRenderWakeLock } from './renderWakeLock'

function fakes(opts: { deny?: boolean; unsupported?: boolean } = {}) {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    const sentinels: { released: boolean; release: () => Promise<void>; dispatchEvent: (e: Event) => boolean; addEventListener: EventTarget['addEventListener'] }[] = []
    const request = vi.fn(async (type: string) => {
        void type
        if (opts.deny) throw new DOMException('no', 'NotAllowedError')
        const t = new EventTarget()
        const s = Object.assign(t, { released: false, release: async () => { s.released = true; t.dispatchEvent(new Event('release')) } })
        sentinels.push(s)
        return s
    })
    const nav = opts.unsupported ? {} : { wakeLock: { request } }
    const setVisibility = (v: 'visible' | 'hidden'): void => { doc.visibilityState = v; doc.dispatchEvent(new Event('visibilitychange')) }
    return { doc, nav, request, sentinels, setVisibility }
}

describe('createRenderWakeLock', () => {
    it('should request a screen wake lock on acquire and release it on release', async () => {
        const f = fakes()
        const w = createRenderWakeLock(f.nav, f.doc)
        await w.acquire()
        expect(f.request).toHaveBeenCalledWith('screen')
        expect(w.status()).toBe('held')
        await w.release()
        expect(f.sentinels[0].released).toBe(true)
        expect(w.status()).toBe('released')
    })
    it('should say unsupported when the browser has no wake lock', async () => {
        const f = fakes({ unsupported: true })
        const w = createRenderWakeLock(f.nav, f.doc)
        await w.acquire()
        expect(w.status()).toBe('unsupported')
        await w.release()
    })
    it('should ignore a denied request', async () => {
        const f = fakes({ deny: true })
        const w = createRenderWakeLock(f.nav, f.doc)
        await expect(w.acquire()).resolves.toBeUndefined()
        expect(w.status()).toBe('denied (NotAllowedError)')
    })
    it('should take the lock again when the page becomes visible while running', async () => {
        const f = fakes()
        const w = createRenderWakeLock(f.nav, f.doc)
        await w.acquire()
        f.setVisibility('hidden')
        await f.sentinels[0].release() // the browser drops it when hidden
        f.setVisibility('visible')
        await new Promise((r) => setTimeout(r, 0))
        expect(f.request).toHaveBeenCalledTimes(2)
        expect(w.status()).toBe('held (re-acquired 1x)')
    })
    it('should not take the lock again after release', async () => {
        const f = fakes()
        const w = createRenderWakeLock(f.nav, f.doc)
        await w.acquire()
        await w.release()
        f.setVisibility('hidden'); f.setVisibility('visible')
        await new Promise((r) => setTimeout(r, 0))
        expect(f.request).toHaveBeenCalledTimes(1)
    })
    it('should not request twice while a lock is held', async () => {
        const f = fakes()
        const w = createRenderWakeLock(f.nav, f.doc)
        await w.acquire()
        f.setVisibility('hidden'); f.setVisibility('visible')
        await new Promise((r) => setTimeout(r, 0))
        expect(f.request).toHaveBeenCalledTimes(1)
    })
})
