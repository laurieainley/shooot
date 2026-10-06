import type { Cut, RenderOverlay } from './types'

/**
 * A replay's crop as an overlay over the whole cut: the graphics session re-encodes the cut's GOPs and replaces
 * each picture with the cropped, scaled one before anything else is drawn. `cutStart` / `realEnd` are the cut's real
 * extent (key frame before the requested start, whole GOPs).
 */
export function cropOverlayFor(cut: Cut, cutIndex: number, cutStart: number, realEnd: number): RenderOverlay {
    return {
        label: cut.cropLabel ?? 'Replay zoom',
        cutIndex,
        startSec: cutStart,
        durationSec: Math.max(1e-3, realEnd - cutStart) + 1,
        paint: () => undefined,
        rows: () => [0, 0],
        crop: cut.crop,
    }
}

/** Names of the crops in a plan (what "Rendered without" lists when they cannot be made). */
export function cropLabels(cuts: Cut[]): string[] {
    return cuts.filter((c) => c.crop).map((c) => c.cropLabel ?? 'Replay zoom')
}
