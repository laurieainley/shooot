// Geometry and fills shared by the themes' painters. The 1920×1080 design is scaled uniformly and centred in the frame.
import { DESIGN_H, DESIGN_W } from './layout'
import { stripeBands, teamFill } from './teamFill'

export type PaintAssets = { logo: ImageBitmap | null }
export type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

/** Scale and offset that fit the design space into a `width`×`height` frame. */
export function designFit(width: number, height: number): { s: number; ox: number; oy: number } {
    const s = Math.min(width / DESIGN_W, height / DESIGN_H)
    return { s, ox: (width - DESIGN_W * s) / 2, oy: (height - DESIGN_H * s) / 2 }
}

export type Box = { x: number; y: number; w: number; h: number }

/** Baseline y that centres ink spanning `ascent` above to `descent` below the baseline on `centreY`. */
export function centredBaseline(centreY: number, ascent: number, descent: number): number {
    return centreY + (ascent - descent) / 2
}

/** `inner` moved (and, if larger than `box`, shrunk with its aspect ratio kept) to lie wholly inside `box`. */
export function clampInto(box: Box, inner: Box): Box {
    const k = Math.min(1, box.w / inner.w, box.h / inner.h)
    const w = inner.w * k
    const h = inner.h * k
    const fits = k === 1
    const x = fits ? Math.min(Math.max(inner.x, box.x), box.x + box.w - w) : box.x + (box.w - w) / 2
    const y = fits ? Math.min(Math.max(inner.y, box.y), box.y + box.h - h) : box.y + (box.h - h) / 2
    return { x, y, w, h }
}

/** Fills the current path (or `box` when there is none) with a colour or, for 'multi', diagonal stripes clipped to it. */
export function fillShape(ctx: Ctx, fill: string, box: Box, hasPath: boolean): void {
    const f = teamFill(fill)
    if (f.kind === 'solid') {
        ctx.fillStyle = f.color
        if (hasPath) ctx.fill()
        else ctx.fillRect(box.x, box.y, box.w, box.h)
        return
    }
    ctx.save()
    if (!hasPath) { ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h) }
    ctx.clip()
    for (const b of stripeBands(box, f.colors)) {
        ctx.fillStyle = b.color
        ctx.beginPath()
        b.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)))
        ctx.closePath()
        ctx.fill()
    }
    ctx.restore()
}

