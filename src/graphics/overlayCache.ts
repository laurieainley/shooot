// Experiment 5 (bench only): paint each overlay's still stretch once into a bitmap band and draw that per video frame.
// Captions, the score bug and the REPLAY tag only move during their short fades; in between every frame is identical.
type Ctx = OffscreenCanvasRenderingContext2D

export type CachedPaintSpec = {
    /** Identifies the overlay (one cache entry set per overlay). */
    id: string
    /** Design-space rows the overlay touches, in output pixels for a W x H frame (as RenderOverlay.rows). */
    rows: (w: number, h: number) => [number, number]
    /** Draws the overlay at its own clock `tc` onto a canvas of the output size. */
    draw: (ctx: Ctx, tc: number) => void
    /** Overlay clock for the engine's local time. */
    clock: (t: number) => number
    /** The overlay holds still between these clock times (inclusive); null = never animates. */
    still: { from: number; to: number } | null
    /** Extra cache key for content that changes while still (e.g. which score is shown). */
    variant?: (t: number) => string
}

export class OverlayBitmapCache {
    hits = 0
    misses = 0
    /** Misses on a still stretch (should be one per overlay and size). */
    stillMisses = 0
    /** Time spent in cached painters, ms (paint on a miss, draw on a hit). */
    ms = 0
    private readonly bitmaps = new Map<string, { bm: ImageBitmap; y0: number }>()

    painter(spec: CachedPaintSpec): (ctx: Ctx, t: number) => void {
        return (ctx, t) => {
            const t0 = performance.now()
            const W = ctx.canvas.width
            const H = ctx.canvas.height
            const tc = spec.clock(t)
            const isStill = !!spec.still && tc >= spec.still.from - 1e-9 && tc <= spec.still.to + 1e-9
            const paintAt = isStill ? (spec.still!.from + spec.still!.to) / 2 : tc
            const key = `${spec.id}|${W}x${H}|${isStill ? 'still' : `f${Math.round(tc * 240)}`}|${spec.variant?.(t) ?? ''}`
            let e = this.bitmaps.get(key)
            if (e) this.hits++
            else {
                this.misses++
                if (isStill) this.stillMisses++
                const [r0, r1] = spec.rows(W, H)
                const y0 = Math.max(0, Math.floor(r0) - 4)
                const y1 = Math.min(H, Math.ceil(r1) + 4)
                const band = new OffscreenCanvas(W, Math.max(1, y1 - y0))
                const bctx = band.getContext('2d')
                if (!bctx) throw new Error('no 2D canvas for the overlay cache')
                bctx.translate(0, -y0)
                spec.draw(bctx, paintAt)
                e = { bm: band.transferToImageBitmap(), y0 }
                this.bitmaps.set(key, e)
            }
            ctx.drawImage(e.bm, 0, e.y0)
            this.ms += performance.now() - t0
        }
    }

    stats(): { hits: number; misses: number; stillMisses: number; entries: number; ms: number } {
        return { hits: this.hits, misses: this.misses, stillMisses: this.stillMisses, entries: this.bitmaps.size, ms: +this.ms.toFixed(1) }
    }

    dispose(): void {
        for (const { bm } of this.bitmaps.values()) bm.close()
        this.bitmaps.clear()
    }
}
