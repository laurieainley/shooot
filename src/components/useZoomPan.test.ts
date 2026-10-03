// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useZoomPan } from './useZoomPan'

const viewport = (): { width: number; height: number } => ({ width: 1000, height: 500 })

describe('useZoomPan', () => {
    it('should cycle 1× → 1.5× → 2× → 1× on Z and reset the pan back at 1×', () => {
        const { result } = renderHook(() => useZoomPan(viewport))
        expect(result.current.zoom).toBe(1)
        act(() => result.current.cycle())
        expect(result.current.zoom).toBe(1.5)
        act(() => result.current.cycle())
        act(() => result.current.panBy(100, 50))
        expect(result.current.pan).toEqual({ x: 100, y: 50 })
        act(() => result.current.cycle())
        expect(result.current.zoom).toBe(1)
        expect(result.current.pan).toEqual({ x: 0, y: 0 })
    })

    it('should reset zoom and pan on 0', () => {
        const { result } = renderHook(() => useZoomPan(viewport))
        act(() => { result.current.cycle(); result.current.cycle() })
        act(() => result.current.panBy(80, 20))
        act(() => result.current.reset())
        expect(result.current.zoom).toBe(1)
        expect(result.current.pan).toEqual({ x: 0, y: 0 })
    })

    it('should clamp the pan at 2× for a 1000×500 player', () => {
        const { result } = renderHook(() => useZoomPan(viewport))
        act(() => { result.current.cycle(); result.current.cycle() })
        act(() => result.current.panBy(900, -900))
        expect(result.current.pan).toEqual({ x: 500, y: -250 })
    })

    it('should not pan at 1×', () => {
        const { result } = renderHook(() => useZoomPan(viewport))
        act(() => result.current.panBy(50, 50))
        expect(result.current.pan).toEqual({ x: 0, y: 0 })
    })

    it('should follow a pinch continuously, then snap to a level and re-clamp the pan on release', () => {
        const { result } = renderHook(() => useZoomPan(viewport))
        act(() => result.current.pinchTo(1.8))
        expect(result.current.zoom).toBe(1.8)
        act(() => result.current.panBy(400, 0))
        expect(result.current.pan.x).toBe(400)
        act(() => result.current.pinchEnd())
        expect(result.current.zoom).toBe(2)
        act(() => result.current.pinchTo(1.2))
        act(() => result.current.pinchEnd())
        expect(result.current.zoom).toBe(1)
        expect(result.current.pan).toEqual({ x: 0, y: 0 })
    })
})
