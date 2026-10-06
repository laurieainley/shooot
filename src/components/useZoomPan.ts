import { useCallback, useMemo, useState } from 'react'
import { zoomTowards, clampPan, clampZoom, nextZoom, settleZoom, type Pan } from '../utils/zoom'

type Viewport = { width: number; height: number }
type View = { zoom: number; pan: Pan }

export type ZoomPan = View & {
    cycle: () => void
    reset: () => void
    panBy: (dx: number, dy: number) => void
    pinchTo: (zoom: number) => void
    pinchEnd: () => void
    /** Multiply the zoom by `factor`, keeping the point under `cursor` (offset from the viewport centre) fixed. */
    zoomAt: (factor: number, cursor: Pan) => void
}

const HOME: View = { zoom: 1, pan: { x: 0, y: 0 } }

/** Player zoom (Z cycles 1× → 1.5× → 2× → 3× → 4×, 0 resets, pinch is continuous up to 4×) and clamped pan. */
export function useZoomPan(getViewport: () => Viewport): ZoomPan {
    const [view, setView] = useState<View>(HOME)
    const withZoom = useCallback((zoom: number, pan: Pan): View => {
        if (zoom <= 1) return HOME
        return { zoom, pan: clampPan(zoom, pan, getViewport()) }
    }, [getViewport])

    const cycle = useCallback(() => setView((v) => withZoom(nextZoom(v.zoom), v.pan)), [withZoom])
    const reset = useCallback(() => setView(HOME), [])
    const panBy = useCallback((dx: number, dy: number) => setView((v) => withZoom(v.zoom, { x: v.pan.x + dx, y: v.pan.y + dy })), [withZoom])
    const pinchTo = useCallback((zoom: number) => setView((v) => withZoom(clampZoom(zoom), v.pan)), [withZoom])
    const pinchEnd = useCallback(() => setView((v) => withZoom(settleZoom(v.zoom), v.pan)), [withZoom])

    const zoomAt = useCallback((factor: number, cursor: Pan) => setView((v) => {
        const r = zoomTowards(v.zoom, v.pan, v.zoom * factor, cursor, getViewport())
        return r.zoom <= 1 ? HOME : r
    }), [getViewport])

    return useMemo(() => ({ ...view, cycle, reset, panBy, pinchTo, pinchEnd, zoomAt }), [view, cycle, reset, panBy, pinchTo, pinchEnd, zoomAt])
}
