// Executes layout draw ops on a canvas. The 1920×1080 design is scaled uniformly and centred in the frame.
import { DESIGN_H, DESIGN_W, type DrawOp } from './layout'
import { NAVY, NAVY_DARK } from './teamStyle'

export const DISPLAY_FONT = '"Bebas Neue", "Oswald", "Arial Narrow", sans-serif'

export type PaintAssets = { logo: ImageBitmap | null }
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

/** Scale and offset that fit the design space into a `width`×`height` frame. */
export function designFit(width: number, height: number): { s: number; ox: number; oy: number } {
    const s = Math.min(width / DESIGN_W, height / DESIGN_H)
    return { s, ox: (width - DESIGN_W * s) / 2, oy: (height - DESIGN_H * s) / 2 }
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
                ctx.fillStyle = op.fill
                ctx.fillRect(op.x, op.y, op.w, op.h)
                break
            case 'shield':
                shieldPath(ctx, op.cx, op.cy, op.w, op.h)
                ctx.fillStyle = op.fill
                ctx.fill()
                ctx.lineWidth = op.lineWidth
                ctx.strokeStyle = op.stroke
                ctx.stroke()
                break
            case 'text':
                ctx.fillStyle = op.color
                ctx.font = `${op.size}px ${DISPLAY_FONT}`
                ctx.textAlign = op.align
                ctx.textBaseline = op.baseline
                ctx.fillText(op.text, op.x, op.y, op.maxWidth)
                break
            case 'logo': {
                const logo = assets.logo
                if (!logo) break
                const w = (logo.width / logo.height) * op.h
                ctx.drawImage(logo, op.align === 'center' ? op.x - w / 2 : op.x, op.y, w, op.h)
                break
            }
        }
    }
    ctx.restore()
}
