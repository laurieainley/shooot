import { useCallback, useMemo, useState } from 'react'
import { clampPan, nextZoom, snapZoom, type Pan } from '../utils/zoom'

type Viewport = { width: number; height: number }
type View = { zoom: number; pan: Pan }

export type ZoomPan = View & {
    cycle: () => void
    reset: () => void
    panBy: (dx: number, dy: number) => void
    pinchTo: (zoom: number) => void
    pinchEnd: () => void
}

const HOME: View = { zoom: 1, pan: { x: 0, y: 0 } }

/** Player zoom (Z cycles 1× / 1.5× / 2×, 0 resets, pinch is continuous and snaps on release) and clamped pan. */
export function useZoomPan(getViewport: () => Viewport): ZoomPan {
    const [view, setView] = useState<View>(HOME)
    const withZoom = useCallback((zoom: number, pan: Pan): View => {
        if (zoom <= 1) return HOME
        return { zoom, pan: clampPan(zoom, pan, getViewport()) }
    }, [getViewport])

    const cycle = useCallback(() => setView((v) => withZoom(nextZoom(v.zoom), v.pan)), [withZoom])
    const reset = useCallback(() => setView(HOME), [])
    const panBy = useCallback((dx: number, dy: number) => setView((v) => withZoom(v.zoom, { x: v.pan.x + dx, y: v.pan.y + dy })), [withZoom])
    const pinchTo = useCallback((zoom: number) => setView((v) => withZoom(Math.min(2, Math.max(1, zoom)), v.pan)), [withZoom])
    const pinchEnd = useCallback(() => setView((v) => withZoom(snapZoom(v.zoom), v.pan)), [withZoom])

    return useMemo(() => ({ ...view, cycle, reset, panBy, pinchTo, pinchEnd }), [view, cycle, reset, panBy, pinchTo, pinchEnd])
}
