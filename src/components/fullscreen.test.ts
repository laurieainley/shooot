// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'

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
