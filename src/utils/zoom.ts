export const ZOOM_LEVELS = [1, 1.5, 2] as const

export function nextZoom(current: number): number {
    const i = ZOOM_LEVELS.findIndex((z) => z === current)
    return i === -1 || i === ZOOM_LEVELS.length - 1 ? 1 : ZOOM_LEVELS[i + 1]
}

export type Pan = { x: number; y: number }

export function clampPan(zoom: number, pan: Pan, viewport: { width: number; height: number }): Pan {
    const maxX = ((zoom - 1) * viewport.width) / 2
    const maxY = ((zoom - 1) * viewport.height) / 2
    const clamp = (v: number, m: number): number => (m <= 0 ? 0 : Math.max(-m, Math.min(m, v)))
    return { x: clamp(pan.x, maxX), y: clamp(pan.y, maxY) }
}

export function snapZoom(z: number): number {
    return ZOOM_LEVELS.reduce<number>((best, l) => (Math.abs(l - z) < Math.abs(best - z) ? l : best), ZOOM_LEVELS[0])
}
