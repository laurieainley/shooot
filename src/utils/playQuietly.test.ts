import { describe, expect, it, vi } from 'vitest'
import { playQuietly } from './playQuietly'

describe('playQuietly', () => {
    it('should ignore an AbortError from an interrupted play()', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const abort = new Error('interrupted'); abort.name = 'AbortError'
        playQuietly({ play: () => Promise.reject(abort) })
        await new Promise((r) => setTimeout(r, 0))
        expect(err).not.toHaveBeenCalled()
        err.mockRestore()
    })
    it('should log other errors and accept a player whose play() returns nothing', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        playQuietly({ play: () => Promise.reject(new Error('NotAllowedError')) })
        playQuietly({ play: () => undefined })
        await new Promise((r) => setTimeout(r, 0))
        expect(err).toHaveBeenCalledTimes(1)
        err.mockRestore()
    })
})
