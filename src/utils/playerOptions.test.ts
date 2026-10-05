import { describe, it, expect } from 'vitest'
import { playerOptions } from './playerOptions'

describe('playerOptions', () => {
    it('should drop the picture-in-picture button', () => {
        expect(playerOptions(false).controlBar.pictureInPictureToggle).toBe(false)
    })

    it('should show elapsed time / duration instead of the remaining time', () => {
        const { controlBar } = playerOptions(false)
        expect(controlBar).toMatchObject({ currentTimeDisplay: true, timeDivider: true, durationDisplay: true, remainingTimeDisplay: false })
    })

    it('should hide the controls while previewing', () => {
        expect(playerOptions(true).controls).toBe(false)
        expect(playerOptions(false).controls).toBe(true)
    })
})
