// Executes layout draw ops on a canvas. The 1920×1080 design is scaled uniformly and centred in the frame.
import { DESIGN_H, DESIGN_W, type DrawOp, type MeasureText } from './layout'
import { stripeBands, teamFill } from './teamFill'
import { NAVY, NAVY_DARK } from './teamStyle'

export const DISPLAY_FONT = '"Bebas Neue", "Oswald", "Arial Narrow", sans-serif'

export type PaintAssets = { logo: ImageBitmap | null }
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

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

/** Reference glyphs: capitals and digits, which is all the graphics draw (no descenders to skew the centring). */
const INK_REFERENCE = 'H0'

/**
 * Ascent / descent of the display font's capitals at `size`, measured by the platform rather than guessed, so text
 * centres the same with Bebas Neue as with a fallback (font metrics and 'middle' baselines differ per platform).
 */
export function textInkMetrics(ctx: Ctx, size: number): { ascent: number; descent: number } {
    ctx.save()
    ctx.font = `${size}px ${DISPLAY_FONT}`
    ctx.textBaseline = 'alphabetic'
    const m = ctx.measureText(INK_REFERENCE)
    ctx.restore()
    const hasBox = Number.isFinite(m.actualBoundingBoxAscent) && m.actualBoundingBoxAscent > 0
    return hasBox
        ? { ascent: m.actualBoundingBoxAscent, descent: Math.max(0, m.actualBoundingBoxDescent || 0) }
        : { ascent: size * 0.7, descent: 0 }
}

/** Fills the current path (or `box` when there is none) with a colour or, for 'multi', diagonal stripes clipped to it. */
function fillShape(ctx: Ctx, fill: string, box: Box, hasPath: boolean): void {
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

function shieldPath(ctx: Ctx, cx: number, cy: number, w: number, h: number): void {
    ctx.beginPath()
    ctx.moveTo(cx - w / 2, cy - h / 2)
    ctx.lineTo(cx + w / 2, cy - h / 2)
    ctx.lineTo(cx + w / 2, cy + h * 0.12)
    ctx.lineTo(cx, cy + h / 2)
    ctx.lineTo(cx - w / 2, cy + h * 0.12)
    ctx.closePath()
}

function background(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): void {
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, NAVY)
    g.addColorStop(1, NAVY_DARK)
    ctx.fillStyle = g
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    // Faint wide diagonal stripes.
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    for (let x = x0 - 1200; x < x1; x += 360) {
        ctx.beginPath()
        ctx.moveTo(x, y1)
        ctx.lineTo(x + 180, y1)
        ctx.lineTo(x + 180 + (y1 - y0), y0)
        ctx.lineTo(x + (y1 - y0), y0)
        ctx.closePath()
        ctx.fill()
    }
}

/** Real text widths for layouts, from the canvas's font metrics. */
export function measureWith(ctx: Ctx): MeasureText {
    return (text, size) => {
        ctx.save()
        ctx.font = `${size}px ${DISPLAY_FONT}`
        const w = ctx.measureText(text).width
        ctx.restore()
        return w
    }
}

export function paintOps(ctx: Ctx, ops: DrawOp[], assets: PaintAssets): void {
    const { width, height } = ctx.canvas
    const { s, ox, oy } = designFit(width, height)
    ctx.save()
    ctx.setTransform(s, 0, 0, s, ox, oy)
    for (const op of ops) {
        if (op.kind === 'cardBackground') {
            background(ctx, -ox / s, -oy / s, (width - ox) / s, (height - oy) / s)
            continue
        }
        ctx.globalAlpha = op.alpha ?? 1
        if (ctx.globalAlpha <= 0) continue
        switch (op.kind) {
            case 'rect':
                fillShape(ctx, op.fill, op, false)
                break
            case 'shield': {
                const r = op.box ? clampInto(op.box, { x: op.cx - op.w / 2, y: op.cy - op.h / 2, w: op.w, h: op.h }) : { x: op.cx - op.w / 2, y: op.cy - op.h / 2, w: op.w, h: op.h }
                shieldPath(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h)
                fillShape(ctx, op.fill, r, true)
                shieldPath(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h) // stripes leave their last band as the current path
                ctx.lineWidth = op.lineWidth
                ctx.strokeStyle = op.stroke
                ctx.stroke()
                break
            }
            case 'text': {
                ctx.fillStyle = op.color
                ctx.font = `${op.size}px ${DISPLAY_FONT}`
                ctx.textAlign = op.align
                ctx.textBaseline = 'alphabetic'
                let y = op.y
                if (op.baseline === 'middle') {
                    const m = textInkMetrics(ctx, op.size)
                    y = centredBaseline(op.y, m.ascent, m.descent)
                }
                if (op.outline) {
                    ctx.save()
                    ctx.lineJoin = 'round'
                    ctx.lineWidth = Math.max(2, op.size * 0.09)
                    ctx.strokeStyle = op.outline
                    ctx.strokeText(op.text, op.x, y, op.maxWidth)
                    ctx.restore()
                }
                ctx.fillText(op.text, op.x, y, op.maxWidth)
                break
            }
            case 'logo': {
                const logo = assets.logo
                if (!logo) break
                const w = (logo.width / logo.height) * op.h
                const r = { x: op.align === 'center' ? op.x - w / 2 : op.x, y: op.y, w, h: op.h }
                const c = op.box ? clampInto(op.box, r) : r
                ctx.drawImage(logo, c.x, c.y, c.w, c.h)
                break
            }
        }
    }
    ctx.restore()
}
