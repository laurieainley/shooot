// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTagUi, useControlsVisibility } from './tagView'
import { setPlayerPaused } from './playerControl'

beforeEach(() => { vi.useFakeTimers(); useTagUi.setState({ controlsVisible: true, pokes: 0 }) })
afterEach(() => { vi.useRealTimers(); setPlayerPaused(true) })

describe('touch view controls visibility', () => {
    it('should never hide by themselves while playing, however long it plays', () => {
        setPlayerPaused(false)
        const { result } = renderHook(() => useControlsVisibility(true))
        expect(result.current).toBe(true)
        act(() => { vi.advanceTimersByTime(5000) })
        expect(result.current).toBe(true)
        act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })
        expect(result.current).toBe(true)
    })

    it('should stay hidden after a tap hid them, also while playing, until a tap shows them', () => {
        setPlayerPaused(false)
        const { result } = renderHook(() => useControlsVisibility(true))
        act(() => useTagUi.getState().setControlsVisible(false)) // a single tap on the picture
        act(() => { vi.advanceTimersByTime(60_000) })
        expect(result.current).toBe(false)
        act(() => { setPlayerPaused(true) })
        expect(result.current).toBe(false) // pausing does not bring them back
        act(() => useTagUi.getState().poke()) // the next tap
        expect(result.current).toBe(true)
    })

    it('should not hide after a poke (a touch on a control) either', () => {
        setPlayerPaused(false)
        const { result } = renderHook(() => useControlsVisibility(true))
        act(() => useTagUi.getState().poke())
        act(() => { vi.advanceTimersByTime(30_000) })
        expect(result.current).toBe(true)
    })

    it('should be visible again when the controls are not over the picture (portrait band)', () => {
        const { result, rerender } = renderHook(({ overlay }) => useControlsVisibility(overlay), { initialProps: { overlay: true } })
        act(() => useTagUi.getState().setControlsVisible(false))
        expect(result.current).toBe(false)
        rerender({ overlay: false })
        expect(result.current).toBe(true)
    })
})
