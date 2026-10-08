// Executes the Shooot theme's draw ops on a canvas.
import { DESIGN_H, DESIGN_W } from '../../layout'
import { centredBaseline, clampInto, designFit, fillShape, type Ctx, type PaintAssets } from '../../paint'
import type { DrawOp, MeasureText } from './layout'
import { C, SKEW } from './brandColors'
import { VOICES, fontCss, type FontVoice } from './fonts'

/** Sets a voice's font (and its letter spacing, where the canvas supports it) on the context. */
function setVoice(ctx: Ctx, voice: FontVoice, size: number): void {
    ctx.font = fontCss(voice, size)
    if ('letterSpacing' in ctx) ctx.letterSpacing = VOICES[voice].letterSpacing
}

/** Reference glyphs: capitals and digits, which is all the graphics draw (no descenders to skew the centring). */
const INK_REFERENCE = 'H0'

/**
 * Ascent / descent of the display font's capitals at `size`, measured by the platform rather than guessed, so text
 * centres the same with the brand font as with a fallback (font metrics and 'middle' baselines differ per platform).
 */
export function textInkMetrics(ctx: Ctx, size: number, voice: FontVoice = 'stadium'): { ascent: number; descent: number } {
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

function polyPath(ctx: Ctx, points: [number, number][]): void {
    ctx.beginPath()
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
}

function background(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): void {
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, C.ground)
    g.addColorStop(1, C.surface)
    ctx.fillStyle = g
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
}

/** Faint pitch markings (no mowing stripes): touchlines, halfway line, centre circle, both penalty and six-yard boxes. */
function pitch(ctx: Ctx): void {
    ctx.save()
    ctx.strokeStyle = C.pitch
    ctx.fillStyle = C.pitch
    ctx.lineWidth = 6
    const L = 64, T = 64, R = DESIGN_W - 64, B = DESIGN_H - 64, mx = DESIGN_W / 2, my = DESIGN_H / 2
    ctx.strokeRect(L, T, R - L, B - T)
    ctx.beginPath(); ctx.moveTo(mx, T); ctx.lineTo(mx, B); ctx.stroke()
    ctx.beginPath(); ctx.arc(mx, my, 210, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill()
    ctx.strokeRect(L, my - 330, 330, 660)
    ctx.strokeRect(R - 330, my - 330, 330, 660)
    ctx.strokeRect(L, my - 150, 120, 300)
    ctx.strokeRect(R - 120, my - 150, 120, 300)
    ctx.restore()
}

/** Real text widths for layouts, from the canvas's font metrics. */
export function measureWith(ctx: Ctx): MeasureText {
    return (text, size, voice = 'shirt') => {
        ctx.save()
        setVoice(ctx, voice, size)
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
        if (op.kind === 'pitch') {
            ctx.globalAlpha = 1
            pitch(ctx)
            continue
        }
        ctx.globalAlpha = op.alpha ?? 1
        if (ctx.globalAlpha <= 0) continue
        const leaning = (op.kind === 'rect' || op.kind === 'text' || op.kind === 'logo') && op.skew !== undefined
        if (leaning) {
            ctx.save()
            // skewX(-10deg) about the pivot row: x' = x - SKEW × (y - pivot)
            ctx.transform(1, 0, -SKEW, 1, SKEW * op.skew!, 0)
        }
        switch (op.kind) {
            case 'rect':
                fillShape(ctx, op.fill, op, false)
                break
            case 'poly': {
                const xs = op.points.map((p) => p[0])
                const ys = op.points.map((p) => p[1])
                const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
                polyPath(ctx, op.points)
                fillShape(ctx, op.fill, box, true)
                break
            }
            case 'circle':
                ctx.beginPath()
                ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2)
                ctx.fillStyle = op.fill
                ctx.fill()
                if (op.stroke) {
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
        if (leaning) ctx.restore()
    }
    ctx.restore()
}
