// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { FullscreenControls } from './FullscreenControls'
import { useAppState } from '../state'
import { setCoarsePointer } from '../test/pointer'

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

    it('should show a compact score chip in fullscreen only', () => {
        useAppState.setState({
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
            events: [{ id: 'g', matchTimeSec: 5, type: 'goal', team: 'Colours' }],
            cumulativeOffsets: [0], currentFileIndex: 0, currentTimeInFileSec: 20,
        })
        const full = render(<FullscreenControls playerRef={{ current: fakePlayer() }} isFullscreen />)
        expect(full.getByRole('status', { name: 'Score' })).toHaveTextContent('0–1')
        full.unmount()
        setCoarsePointer(true)
        const phone = render(<FullscreenControls playerRef={{ current: fakePlayer() }} isFullscreen={false} />)
        expect(phone.queryByRole('status', { name: 'Score' })).toBeNull()
        setCoarsePointer(false)
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
