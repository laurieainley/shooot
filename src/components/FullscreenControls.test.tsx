// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { FullscreenControls } from './FullscreenControls'
import { useAppState } from '../state'

function fakePlayer() {
    let paused = true
    let time = 20
    return {
        paused: () => paused,
        play: vi.fn(() => { paused = false }),
        pause: vi.fn(() => { paused = true }),
        currentTime: vi.fn((t?: number) => { if (t !== undefined) time = t; return time }),
        playbackRate: () => 1,
    }
}

describe('FullscreenControls', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('should toggle play/pause on a single tap in a tap zone', () => {
        const player = fakePlayer()
        const { container } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(container.querySelector('.tap-zone-left')!)
        act(() => { vi.advanceTimersByTime(400) })
        expect(player.play).toHaveBeenCalledTimes(1)
        fireEvent.click(container.querySelector('.tap-zone-right')!)
        act(() => { vi.advanceTimersByTime(400) })
        expect(player.pause).toHaveBeenCalledTimes(1)
    })

    it('should seek on a double tap without toggling playback', () => {
        const player = fakePlayer()
        const { container } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        const right = container.querySelector('.tap-zone-right')!
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(100) })
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(600) })
        expect(player.currentTime).toHaveBeenLastCalledWith(25)
        expect(player.play).not.toHaveBeenCalled()
        expect(player.pause).not.toHaveBeenCalled()
    })

    it('should mark an event from the overlay button', () => {
        const player = fakePlayer()
        useAppState.setState({ events: [], picker: null, currentFileIndex: 0, files: [] })
        const { getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(getByRole('button', { name: /event/i }))
        expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 20, type: 'goal' })
        expect(useAppState.getState().picker).not.toBeNull()
    })

    it('should keep the tap zones but leave marking to the ＋ button on a phone outside fullscreen', () => {
        const original = window.matchMedia
        window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
        const { container, queryByRole } = render(<FullscreenControls playerRef={{ current: fakePlayer() }} isFullscreen={false} />)
        expect(container.querySelector('.tap-zone-left')).not.toBeNull()
        expect(queryByRole('button', { name: /event/i })).toBeNull()
        window.matchMedia = original
    })
})
