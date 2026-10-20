/** Z cycles through these; a pinch can land anywhere between 1× and MAX_ZOOM. */
export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4] as const
export const MAX_ZOOM = 4

/** Next level up (from a pinched zoom between levels: the level above it); after the top, back to 1×. */
export function nextZoom(current: number): number {
    const up = ZOOM_LEVELS.find((z) => z > current + 1e-6)
    return up ?? 1
}

export type Pan = { x: number; y: number }

export function clampPan(zoom: number, pan: Pan, viewport: { width: number; height: number }): Pan {
    const maxX = ((zoom - 1) * viewport.width) / 2
    const maxY = ((zoom - 1) * viewport.height) / 2
    const clamp = (v: number, m: number): number => (m <= 0 ? 0 : Math.max(-m, Math.min(m, v)))
    return { x: clamp(pan.x, maxX), y: clamp(pan.y, maxY) }
}

export function clampZoom(z: number, max: number = MAX_ZOOM): number {
    return Math.min(max, Math.max(1, z))
}

/** Where a released pinch rests: where the fingers left it, except just above 1× snaps back home. */
export function settleZoom(z: number, max: number = MAX_ZOOM): number {
    const c = clampZoom(z, max)
    return c < 1.1 ? 1 : c
}

type Viewport = { width: number; height: number }

/**
 * Zoom to `nextZoom` keeping the picture point under the cursor where it is.
 * `cursor` is measured from the viewport centre (the transform origin); the transform is translate(pan) scale(zoom).
 */
export function zoomTowards(zoom: number, pan: Pan, nextZoom: number, cursor: Pan, viewport: Viewport, max: number = MAX_ZOOM): { zoom: number; pan: Pan } {
    const z = clampZoom(nextZoom, max)
    if (z <= 1) return { zoom: 1, pan: { x: 0, y: 0 } }
    const k = z / zoom
    const raw = { x: cursor.x - (cursor.x - pan.x) * k, y: cursor.y - (cursor.y - pan.y) * k }
    return { zoom: z, pan: clampPan(z, raw, viewport) }
}

/** A drag of (dx, dy) screen pixels moves the picture by the same amount, within the picture's bounds. */
export function dragPan(zoom: number, pan: Pan, dx: number, dy: number, viewport: Viewport): Pan {
    return clampPan(zoom, { x: pan.x + dx, y: pan.y + dy }, viewport)
}

export const CLICK_MAX_DISTANCE_PX = 5
export const CLICK_MAX_DURATION_MS = 300

/** A press that barely moves and is released quickly is a click; anything else is a drag. */
export function classifyPointer(distancePx: number, durationMs: number): 'click' | 'drag' {
    return distancePx < CLICK_MAX_DISTANCE_PX && durationMs < CLICK_MAX_DURATION_MS ? 'click' : 'drag'
}

const WHEEL_MAX_PX = 10

/** A wheel delta in pixels: line-based wheels (Firefox, some mice) report lines (~16 px each) or pages (~100 px). */
export function wheelDeltaPx(delta: number, deltaMode = 0): number {
    return deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * 100 : delta
}

/**
 * Multiplicative zoom step for a wheel / trackpad-pinch delta (exponential, so in and out are symmetric). One event is
 * at most about 10%, so a free-spinning wheel that fires many events still zooms smoothly.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
    const px = wheelDeltaPx(deltaY, deltaMode)
    return Math.exp(-Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, px)) * 0.01)
}

/** The pan is stored in pixels of the old viewport, so any change of size (rotation, entering fullscreen) makes it wrong: the zoom starts again. */
export function viewportChanged(prev: { width: number; height: number } | null, next: { width: number; height: number }): boolean {
    return prev !== null && (Math.abs(prev.width - next.width) > 1 || Math.abs(prev.height - next.height) > 1)
}
