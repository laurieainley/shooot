// Experiment 6 (bench only): the part of an overlay's window in which it actually changes any pixel. The stream-copy
// engine re-encodes whole GOPs under an overlay's window, so a window padded beyond what is drawn can pull in extra GOPs.
import type { RenderOverlay } from './types'

const PROBE_W = 192
const PROBE_H = 108

/** [first, last] local time (seconds from `startSec`) at which the overlay draws something, sampled every `step`; null when it never does. */
export function visibleRange(o: RenderOverlay, step = 1 / 30): [number, number] | null {
    if (typeof OffscreenCanvas === 'undefined') return null
    const canvas = new OffscreenCanvas(PROBE_W, PROBE_H)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    const n = Math.max(1, Math.ceil(o.durationSec / step))
    const dt = o.durationSec / n
    let first = -1
    let last = -1
    for (let i = 0; i <= n; i++) {
        const t = Math.min(o.durationSec, i * dt)
        ctx.clearRect(0, 0, PROBE_W, PROBE_H)
        ctx.save()
        try { o.paint(ctx, t) } finally { ctx.restore() }
        const px = ctx.getImageData(0, 0, PROBE_W, PROBE_H).data
        let any = false
        for (let k = 3; k < px.length; k += 4) if (px[k] > 0) { any = true; break }
        if (any) { if (first < 0) first = t; last = t }
    }
    return first < 0 ? null : [first, last]
}

/**
 * The overlays with their windows cut down to the drawn part (one probe step of margin each side). An overlay that
 * never draws keeps a one-frame window at its start. Painting is shifted so the picture is identical.
 */
export function tightenOverlays(overlays: RenderOverlay[]): RenderOverlay[] {
    return overlays.map((o) => {
        const r = visibleRange(o)
        if (!r) return o
        const step = Math.max(1 / 30, o.durationSec / 3000)
        const from = Math.max(0, r[0] - step)
        const to = Math.min(o.durationSec, r[1] + step)
        if (to - from >= o.durationSec - 1e-6) return o
        return { ...o, startSec: o.startSec + from, durationSec: to - from, paint: (ctx, t) => o.paint(ctx, t + from) }
    })
}
