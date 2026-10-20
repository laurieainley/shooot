// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLandscapeFill } from './useLandscapeFill'
import { useAppState } from '../state'
import { setMedia, setCoarsePointer } from '../test/pointer'

const file = { id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 60, kind: 'full' as const }

describe('useLandscapeFill', () => {
    let container: HTMLDivElement
    let player: { exitFullscreen: () => void }
    let exitSpy: ReturnType<typeof vi.fn<() => void>>
    beforeEach(() => {
        container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        document.body.append(container)
        exitSpy = vi.fn<() => void>(() => useAppState.getState().setImmersive(false))
        player = { exitFullscreen: () => { exitSpy() } }
        useAppState.setState({ files: [file], immersive: false, playerFullscreen: false })
        setMedia({ coarse: true, portrait: true })
    })
    afterEach(() => { container.remove(); setCoarsePointer(false); useAppState.setState({ files: [], immersive: false, playerFullscreen: false }) })
    const mount = () => renderHook(() => useLandscapeFill({ current: container }, { current: player }))

    it('should fill the screen (immersive) when the phone turns landscape, and leave it on turning back', () => {
        mount()
        expect(useAppState.getState().immersive).toBe(false)
        act(() => setMedia({ coarse: true, landscape: true }))
        expect(useAppState.getState().immersive).toBe(true)
        act(() => setMedia({ coarse: true, portrait: true }))
        expect(exitSpy).toHaveBeenCalled()
        expect(useAppState.getState().immersive).toBe(false)
    })
    it('should ask for real fullscreen on the first tap only', () => {
        act(() => setMedia({ coarse: true, landscape: true }))
        mount()
        expect(container.requestFullscreen).not.toHaveBeenCalled()
        act(() => { window.dispatchEvent(new Event('pointerup')) })
        expect(container.requestFullscreen).toHaveBeenCalledTimes(1)
    })
    it('should not fill with a mouse, with no video, or in portrait', () => {
        setMedia({ landscape: true }) // mouse
        mount()
        expect(useAppState.getState().immersive).toBe(false)
        useAppState.setState({ files: [] })
        act(() => setMedia({ coarse: true, landscape: true }))
        expect(useAppState.getState().immersive).toBe(false)
    })
    it('should stay out when the user leaves the fill while still landscape', () => {
        mount()
        act(() => setMedia({ coarse: true, landscape: true }))
        act(() => useAppState.getState().setImmersive(false))
        expect(useAppState.getState().immersive).toBe(false)
        act(() => { window.dispatchEvent(new Event('pointerup')) })
        expect(container.requestFullscreen).not.toHaveBeenCalled()
    })
    it('should keep fullscreen the user chose in portrait when turning sideways and back', () => {
        mount()
        act(() => useAppState.getState().setImmersive(true))
        act(() => setMedia({ coarse: true, landscape: true }))
        act(() => setMedia({ coarse: true, portrait: true }))
        expect(exitSpy).not.toHaveBeenCalled()
        expect(useAppState.getState().immersive).toBe(true)
    })
})
