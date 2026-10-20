// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { FullscreenControls } from './FullscreenControls'
import { useAppState } from '../state'
import { setCoarsePointer } from '../test/pointer'
import { useFullscreenUi } from './fullscreenUi'
import { setPlayerPaused } from './playerControl'

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

    beforeEach(() => { useAppState.setState({ files: [], picker: null }) })

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

    it('should ignore a third tap right after a double tap: one seek, no play/pause', () => {
        const player = fakePlayer()
        const { container } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        const right = container.querySelector('.tap-zone-right')!
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(100) })
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(150) })
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(1000) })
        expect(player.currentTime).toHaveBeenCalledWith(25)
        expect(player.play).not.toHaveBeenCalled()
        expect(player.pause).not.toHaveBeenCalled()
        // a later single tap is normal again
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(400) })
        expect(player.play).toHaveBeenCalledTimes(1)
    })

    it('should toggle play/pause at once on a centre tap', () => {
        const player = fakePlayer()
        const { container } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(container.querySelector('.tap-zone-centre')!)
        expect(player.play).toHaveBeenCalledTimes(1)
    })

    it('should seek back on a double tap on the left third', () => {
        setCoarsePointer(true)
        const player = fakePlayer()
        const { container } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen={false} />)
        const left = container.querySelector('.tap-zone-left')!
        fireEvent.click(left)
        fireEvent.click(left)
        act(() => { vi.advanceTimersByTime(600) })
        expect(player.currentTime).toHaveBeenLastCalledWith(15)
        expect(player.play).not.toHaveBeenCalled()
    })

    it('should hide the ＋ while the review panel is visible in fullscreen and bring it back when it is tucked away', () => {
        useAppState.setState({ picker: null, files: [{ id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), kind: 'full' }] })
        useFullscreenUi.setState({ columnPanel: 'review' })
        const { queryByRole } = render(<FullscreenControls playerRef={{ current: fakePlayer() }} isFullscreen />)
        expect(queryByRole('button', { name: 'Tag event' })).toBeNull()
        act(() => { useFullscreenUi.setState({ columnPanel: null }) })
        expect(queryByRole('button', { name: 'Tag event' })).not.toBeNull()
    })

    it('should mark events with the ＋ button in fullscreen, not the old Event overlay', () => {
        const player = fakePlayer()
        useAppState.setState({ events: [], picker: null, currentFileIndex: 0, currentTimeInFileSec: 20, files: [{ id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), kind: 'full' }] })
        const { getByRole, queryByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        expect(queryByRole('button', { name: 'Event' })).toBeNull()
        fireEvent.click(getByRole('button', { name: 'Tag event' }))
        expect(useAppState.getState().events).toEqual([])
        expect(useAppState.getState().picker?.pending).toEqual({ matchTimeSec: 20, sourceFileIndex: 0 })
        expect(queryByRole('button', { name: 'Tag event' })).toBeNull()
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

describe('FullscreenControls fullscreen button (touch)', () => {
    afterEach(() => setCoarsePointer(false))
    const withFs = () => ({ ...fakePlayer(), requestFullscreen: vi.fn(), exitFullscreen: vi.fn() })

    it('should offer an always-visible Fullscreen button over the picture on touch screens, entering synchronously', () => {
        setCoarsePointer(true)
        const player = withFs()
        const { getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen={false} />)
        fireEvent.click(getByRole('button', { name: 'Fullscreen' }))
        expect(player.requestFullscreen).toHaveBeenCalledTimes(1)
    })

    it('should offer Exit fullscreen while fullscreen', () => {
        setCoarsePointer(true)
        const player = withFs()
        const { getByRole, queryByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        expect(queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument()
        fireEvent.click(getByRole('button', { name: 'Exit fullscreen' }))
        expect(player.exitFullscreen).toHaveBeenCalledTimes(1)
    })

    it('should leave the button to the control bar with a mouse', () => {
        setCoarsePointer(false)
        const { queryByRole } = render(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen={false} />)
        expect(queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument()
    })
})

describe('FullscreenControls playback lock (touch, fullscreen)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        setCoarsePointer(true)
        useFullscreenUi.setState({ playbackLocked: false, reviewHidden: false })
        setPlayerPaused(true)
    })
    afterEach(() => { vi.useRealTimers(); setCoarsePointer(false) })
    const withFs = () => ({ ...fakePlayer(), requestFullscreen: vi.fn(), exitFullscreen: vi.fn() })

    it('should hide the top-right buttons while the tag box is open (its column would cover them)', () => {
        useAppState.setState({ picker: { kind: 'type' } as never })
        const { queryByRole } = render(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen />)
        expect(queryByRole('button', { name: 'Lock playback' })).toBeNull()
        expect(queryByRole('button', { name: 'Exit fullscreen' })).toBeNull()
        act(() => useAppState.setState({ picker: null }))
        expect(queryByRole('button', { name: 'Exit fullscreen' })).not.toBeNull()
    })
    it('should toggle the lock with a pressed button and the right label', () => {
        const { getByRole } = render(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen />)
        const btn = getByRole('button', { name: 'Lock playback' })
        expect(btn).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(btn)
        const on = getByRole('button', { name: 'Unlock playback' })
        expect(on).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(on)
        expect(getByRole('button', { name: 'Lock playback' })).toHaveAttribute('aria-pressed', 'false')
    })
    it('should show a pause icon beside a closed padlock while playing and locked, a play icon beside an open one while paused and unlocked', () => {
        const { getByRole, rerender } = render(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen />)
        const btn = getByRole('button', { name: 'Lock playback' })
        expect(btn.querySelector('[data-icon="play"]')).not.toBeNull()
        expect(btn.querySelector('[data-lock="open"]')).not.toBeNull()
        act(() => setPlayerPaused(false))
        fireEvent.click(btn)
        rerender(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen />)
        const locked = getByRole('button', { name: 'Unlock playback' })
        expect(locked.querySelector('[data-icon="pause"]')).not.toBeNull()
        expect(locked.querySelector('[data-lock="closed"]')).not.toBeNull()
    })
    it('should not play or pause on a single tap while locked, but still show the controls', () => {
        const player = { ...withFs(), userActive: vi.fn() }
        const { container, getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(getByRole('button', { name: 'Lock playback' }))
        fireEvent.click(container.querySelector('.tap-zone-centre')!)
        fireEvent.click(container.querySelector('.tap-zone-left')!)
        act(() => { vi.advanceTimersByTime(600) })
        expect(player.play).not.toHaveBeenCalled()
        expect(player.pause).not.toHaveBeenCalled()
        expect(player.userActive).toHaveBeenCalledWith(true)
    })
    it('should still seek on a double tap while locked', () => {
        const player = withFs()
        const { container, getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(getByRole('button', { name: 'Lock playback' }))
        const right = container.querySelector('.tap-zone-right')!
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(100) })
        fireEvent.click(right)
        act(() => { vi.advanceTimersByTime(600) })
        expect(player.currentTime).toHaveBeenLastCalledWith(25)
        expect(player.play).not.toHaveBeenCalled()
    })
    it('should make the lock button glow after 3 single taps that toggled playback within 5 s, and not for slower taps', () => {
        const player = withFs()
        const { container, getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        const btn = getByRole('button', { name: 'Lock playback' })
        const centre = container.querySelector('.tap-zone-centre')!
        fireEvent.click(centre); act(() => { vi.advanceTimersByTime(1000) })
        fireEvent.click(centre); act(() => { vi.advanceTimersByTime(1000) })
        expect(btn.className).not.toContain('lock-btn--hint')
        fireEvent.click(centre); act(() => { vi.advanceTimersByTime(10) })
        expect(btn.className).toContain('lock-btn--hint')
        act(() => { vi.advanceTimersByTime(3000) })
        expect(btn.className).not.toContain('lock-btn--hint') // once
    })
    it('should not hint for taps spread over more than 5 s', () => {
        const { container, getByRole } = render(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen />)
        const centre = container.querySelector('.tap-zone-centre')!
        for (let i = 0; i < 3; i++) { fireEvent.click(centre); act(() => { vi.advanceTimersByTime(3000) }) }
        expect(getByRole('button', { name: 'Lock playback' }).className).not.toContain('lock-btn--hint')
    })
    it('should have no lock button with a mouse', () => {
        setCoarsePointer(false)
        const { queryByRole } = render(<FullscreenControls playerRef={{ current: withFs() }} isFullscreen />)
        expect(queryByRole('button', { name: /playback/ })).toBeNull()
    })
})

describe('FullscreenControls Review button (touch, fullscreen)', () => {
    beforeEach(() => {
        setCoarsePointer(true)
        useFullscreenUi.setState({ reviewHidden: false })
        const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 3 }
        useAppState.setState({ files: [], events: [], suggestions: [], suggestionRun: null, panel: null, picker: null })
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }, { timeSec: 500, score: 3 }])
    })
    afterEach(() => { setCoarsePointer(false); useAppState.setState({ panel: null, suggestions: [] }) })
    const fs = () => ({ ...fakePlayer(), requestFullscreen: vi.fn(), exitFullscreen: vi.fn() })

    it('should show Review (N) with the number left, and nothing when none is left', () => {
        const { getByRole, queryByRole, rerender } = render(<FullscreenControls playerRef={{ current: fs() }} isFullscreen />)
        expect(getByRole('button', { name: 'Review (3)' })).toBeTruthy()
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' }) })
        rerender(<FullscreenControls playerRef={{ current: fs() }} isFullscreen />)
        expect(getByRole('button', { name: 'Review (2)' })).toBeTruthy()
        for (const sg of useAppState.getState().suggestions) act(() => { useAppState.getState().decideSuggestion(sg.id, { kind: 'reject' }) })
        rerender(<FullscreenControls playerRef={{ current: fs() }} isFullscreen />)
        expect(queryByRole('button', { name: /^Review/ })).toBeNull()
    })
    it('should open the review, then hide and show its column without leaving fullscreen', () => {
        const player = fs()
        const { getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(getByRole('button', { name: 'Review (3)' }))
        expect(useAppState.getState().panel).toBe('review')
        expect(useFullscreenUi.getState().reviewHidden).toBe(false)
        fireEvent.click(getByRole('button', { name: 'Review (3)' }))
        expect(useFullscreenUi.getState().reviewHidden).toBe(true)
        expect(useAppState.getState().panel).toBe('review')
        fireEvent.click(getByRole('button', { name: 'Review (3)' }))
        expect(useFullscreenUi.getState().reviewHidden).toBe(false)
        expect(player.exitFullscreen).not.toHaveBeenCalled()
    })
    it('should not show the button outside fullscreen or with a mouse', () => {
        const { queryByRole, rerender } = render(<FullscreenControls playerRef={{ current: fs() }} isFullscreen={false} />)
        expect(queryByRole('button', { name: /^Review/ })).toBeNull()
        setCoarsePointer(false)
        rerender(<FullscreenControls playerRef={{ current: fs() }} isFullscreen />)
        expect(queryByRole('button', { name: /^Review/ })).toBeNull()
    })
})
