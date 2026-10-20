import { describe, it, expect, vi, afterEach } from 'vitest'
import { pausePlayer, registerPlayerToggle, setPlayerPaused } from './playerControl'

describe('pausePlayer', () => {
    let unregister = (): void => {}
    afterEach(() => { unregister(); setPlayerPaused(true) })
    it('should pause a playing player', () => {
        const toggle = vi.fn()
        unregister = registerPlayerToggle(toggle)
        setPlayerPaused(false)
        pausePlayer()
        expect(toggle).toHaveBeenCalledTimes(1)
    })
    it('should leave a paused player alone (never start it)', () => {
        const toggle = vi.fn()
        unregister = registerPlayerToggle(toggle)
        setPlayerPaused(true)
        pausePlayer()
        expect(toggle).not.toHaveBeenCalled()
    })
})
