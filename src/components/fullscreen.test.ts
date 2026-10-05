// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'
import { setCoarsePointer } from '../test/pointer'

function fakePlayer(): FullscreenPlayer & { classFs: boolean | undefined } {
    const p = {
        classFs: undefined as boolean | undefined,
        requestFullscreen: vi.fn(),
        exitFullscreen: vi.fn(),
        isFullscreen(v?: boolean) { if (v !== undefined) p.classFs = v; return !!p.classFs },
        trigger: vi.fn(),
    }
    return p
}

describe('patchPlayerFullscreen', () => {
    it('should fullscreen the container instead of the player element', () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container)
        player.requestFullscreen()
        expect(container.requestFullscreen).toHaveBeenCalled()
    })

    it('should report fullscreen from the document and still toggle the video.js class', () => {
        const player = fakePlayer()
        const orig = player.isFullscreen
        patchPlayerFullscreen(player, () => null)
        expect(player.isFullscreen()).toBe(false)
        player.isFullscreen(true)
        expect(orig.call(player)).toBe(true)
    })

    it('should exit through the document', () => {
        document.exitFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => null)
        player.exitFullscreen()
        expect(document.exitFullscreen).toHaveBeenCalled()
    })
})

describe('patchPlayerFullscreen across orientation changes', () => {
    let fsEl: Element | null = null
    beforeEach(() => {
        fsEl = null
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl })
    })
    afterEach(() => { setCoarsePointer(false) })

    it('should only report fullscreen when the container itself is fullscreen', () => {
        const container = document.createElement('div')
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container)
        fsEl = document.createElement('div')
        expect(player.isFullscreen()).toBe(false)
        fsEl = container
        expect(player.isFullscreen()).toBe(true)
    })

    it('should drop stale fullscreen state on resize so the next request enters again', () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => { fsEl = container; return Promise.resolve() })
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container)
        player.requestFullscreen()
        document.dispatchEvent(new Event('fullscreenchange'))
        expect(player.classFs).toBe(true)
        // Rotating the phone leaves fullscreen without a fullscreenchange reaching us
        fsEl = null
        window.dispatchEvent(new Event('resize'))
        expect(player.classFs).toBe(false)
        expect(player.trigger).toHaveBeenLastCalledWith('fullscreenchange')
        player.requestFullscreen()
        expect(container.requestFullscreen).toHaveBeenCalledTimes(2)
    })

    it('should try to lock landscape after entering on a touch screen, ignoring refusals', async () => {
        setCoarsePointer(true)
        const lock = vi.fn(() => Promise.reject(new Error('not allowed')))
        Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock, unlock: vi.fn() } })
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container)
        player.requestFullscreen()
        await new Promise((r) => setTimeout(r, 0))
        expect(lock).toHaveBeenCalledWith('landscape')
    })

    it('should not lock the orientation with a mouse', async () => {
        setCoarsePointer(false)
        const lock = vi.fn(() => Promise.resolve())
        Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock, unlock: vi.fn() } })
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container)
        player.requestFullscreen()
        await new Promise((r) => setTimeout(r, 0))
        expect(lock).not.toHaveBeenCalled()
    })
})

describe('patchPlayerFullscreen on phones (real device fixes and the immersive fallback)', () => {
    let fsEl: Element | null = null
    let immersive = false
    const mode = { get: () => immersive, set: (on: boolean) => { immersive = on } }
    beforeEach(() => {
        fsEl = null
        immersive = false
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl })
    })
    const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

    it('should call requestFullscreen synchronously inside the gesture, hiding the navigation bar', () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container, mode)
        player.requestFullscreen()
        expect(container.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
        expect(immersive).toBe(false)
    })

    it('should fall back to immersive (CSS full viewport) when the browser rejects fullscreen', async () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.reject(new TypeError('Permissions check failed')))
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container, mode)
        player.requestFullscreen()
        await flush()
        expect(immersive).toBe(true)
        expect(player.isFullscreen()).toBe(true)
        expect(player.classFs).toBe(true)
        expect(player.trigger).toHaveBeenCalledWith('fullscreenchange')
    })

    it('should fall back to immersive at once when there is no element fullscreen API (iPhone)', () => {
        const container = document.createElement('div') as HTMLDivElement & { requestFullscreen?: unknown }
        Object.defineProperty(container, 'requestFullscreen', { value: undefined })
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container, mode)
        player.requestFullscreen()
        expect(immersive).toBe(true)
    })

    it('should fall back when requestFullscreen throws', () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => { throw new Error('not allowed') })
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container, mode)
        player.requestFullscreen()
        expect(immersive).toBe(true)
    })

    it('should leave immersive mode on exit without touching the document', () => {
        document.exitFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => document.createElement('div'), mode)
        immersive = true
        player.exitFullscreen()
        expect(immersive).toBe(false)
        expect(document.exitFullscreen).not.toHaveBeenCalled()
        expect(player.classFs).toBe(false)
    })

    it('should not request again while already immersive', () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container, mode)
        immersive = true
        player.requestFullscreen()
        expect(container.requestFullscreen).not.toHaveBeenCalled()
    })
})
