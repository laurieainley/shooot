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

export function clampZoom(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(1, z))
}

/** Where a released pinch rests: where the fingers left it, except just above 1× snaps back home. */
export function settleZoom(z: number): number {
    const c = clampZoom(z)
    return c < 1.1 ? 1 : c
}

type Viewport = { width: number; height: number }

/**
 * Zoom to `nextZoom` keeping the picture point under the cursor where it is.
 * `cursor` is measured from the viewport centre (the transform origin); the transform is translate(pan) scale(zoom).
 */
export function zoomTowards(zoom: number, pan: Pan, nextZoom: number, cursor: Pan, viewport: Viewport): { zoom: number; pan: Pan } {
    const z = clampZoom(nextZoom)
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

/** Multiplicative zoom step for a wheel / trackpad-pinch delta (exponential, so in and out are symmetric). */
export function wheelZoomFactor(deltaY: number): number {
    return Math.exp(-Math.max(-30, Math.min(30, deltaY)) * 0.01)
}
