// Executes the TNF theme's draw ops on a canvas.
import { centredBaseline, clampInto, designFit, fillShape, type Ctx, type PaintAssets } from '../../paint'
import { T } from './colors'
import { fontCss, type FontVoice } from './fonts'
import type { DrawOp, MeasureText } from './layout'

function setVoice(ctx: Ctx, voice: FontVoice, size: number): void {
    ctx.font = fontCss(voice, size)
}

/** Reference glyphs: capitals and digits (no descenders to skew the centring). */
const INK_REFERENCE = 'H0'

/** Ascent / descent of a voice's capitals at `size`, measured by the platform rather than guessed. */
export function textInkMetrics(ctx: Ctx, size: number, voice: FontVoice = 'baloo'): { ascent: number; descent: number } {
    ctx.save()
    setVoice(ctx, voice, size)
    ctx.textBaseline = 'alphabetic'
    const m = ctx.measureText(INK_REFERENCE)
    ctx.restore()
    const hasBox = Number.isFinite(m.actualBoundingBoxAscent) && m.actualBoundingBoxAscent > 0
    return hasBox
        ? { ascent: m.actualBoundingBoxAscent, descent: Math.max(0, m.actualBoundingBoxDescent || 0) }
        : { ascent: size * 0.7, descent: 0 }
}

/** Real text widths for layouts, from the canvas's font metrics. */
export function measureWith(ctx: Ctx): MeasureText {
    return (text, size, voice = 'baloo') => {
        ctx.save()
        setVoice(ctx, voice, size)
        const w = ctx.measureText(text).width
        ctx.restore()
        return w
    }
}

function roundedPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2))
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
}

function starPath(ctx: Ctx, cx: number, cy: number, r: number): void {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rad = i % 2 === 0 ? r : r * 0.45
        const px = cx + Math.cos(a) * rad
        const py = cy + Math.sin(a) * rad
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
    }
    ctx.closePath()
}

/** Alternating orange / white 45° stripes over the box (the current clip decides the visible shape). */
function paintStripes(ctx: Ctx, x: number, y: number, w: number, h: number, sw: number): void {
    ctx.fillStyle = T.white
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = T.orange
    // Stripes run up-right at 45°: each band is a parallelogram from the bottom edge to the top edge.
    for (let o = -h; o < w + h; o += 2 * sw) {
        ctx.beginPath()
        ctx.moveTo(x + o, y + h)
        ctx.lineTo(x + o + sw, y + h)
        ctx.lineTo(x + o + sw + h, y)
        ctx.lineTo(x + o + h, y)
        ctx.closePath()
        ctx.fill()
    }
}

function background(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): void {
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, '#12365A')
    g.addColorStop(1, '#0A2036')
    ctx.fillStyle = g
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
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
            case 'band':
                ctx.save()
                ctx.beginPath()
                ctx.rect(-ox / s, op.y, width / s, op.h)
                ctx.clip()
                paintStripes(ctx, -ox / s, op.y, width / s, op.h, op.sw)
                ctx.restore()
                break
            case 'stripes':
                ctx.save()
                roundedPath(ctx, op.x, op.y, op.w, op.h, op.r)
                ctx.clip()
                paintStripes(ctx, op.x, op.y, op.w, op.h, op.sw)
                ctx.restore()
                break
            case 'stars':
                ctx.fillStyle = op.fill
                for (let i = 0; i < op.count; i++) {
                    starPath(ctx, op.cx + (i - (op.count - 1) / 2) * op.r * 2.4, op.cy, op.r)
                    ctx.fill()
                }
                break
            case 'rect':
                roundedPath(ctx, op.x, op.y, op.w, op.h, op.r)
                fillShape(ctx, op.fill, op, true)
                if (op.stroke) {
                    ctx.lineJoin = 'round'
                    ctx.lineWidth = op.lineWidth ?? 4
                    ctx.strokeStyle = op.stroke
                    ctx.stroke()
                }
                break
            case 'text': {
                ctx.fillStyle = op.color
                setVoice(ctx, op.voice, op.size)
                ctx.textAlign = op.align
                ctx.textBaseline = 'alphabetic'
                let y = op.y
                if (op.baseline === 'middle') {
                    const m = textInkMetrics(ctx, op.size, op.voice)
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

