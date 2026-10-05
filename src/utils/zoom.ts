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
