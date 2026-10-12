import type { CropRect } from '../../types'
import type { Ctx } from '../paint'
import { THUMB_H, THUMB_W, type Measure, type ThumbOp } from './types'

/** Text widths from the canvas's own font metrics. */
export function canvasMeasure(ctx: Ctx): Measure {
    return (text, font, size) => {
        ctx.save()
        ctx.font = font(size)
        const w = ctx.measureText(text).width
        ctx.restore()
        return w
    }
}

/** Draws `image` cover-fitted into the whole canvas, from `crop` (fractions of the image) when given. */
export function drawCover(ctx: Ctx, image: CanvasImageSource, iw: number, ih: number, crop: CropRect | null): void {
    const sx = crop ? crop.x * iw : 0, sy = crop ? crop.y * ih : 0
    const sw = crop ? crop.w * iw : iw, sh = crop ? crop.h * ih : ih
    const k = Math.max(THUMB_W / sw, THUMB_H / sh)
    const w = THUMB_W / k, h = THUMB_H / k
    ctx.drawImage(image, sx + (sw - w) / 2, sy + (sh - h) / 2, w, h, 0, 0, THUMB_W, THUMB_H)
}

/** Executes the ops (over a picture already drawn) on a 1280×720 canvas. */
export function paintThumbnailOps(ctx: Ctx, ops: ThumbOp[], logo: ImageBitmap | null): void {
    for (const op of ops) {
        ctx.save()
        switch (op.kind) {
            case 'shade': {
                const g = ctx.createLinearGradient(0, op.y0, 0, op.y1)
                g.addColorStop(0, `rgba(0,0,0,${op.from})`)
                g.addColorStop(1, `rgba(0,0,0,${op.to})`)
                ctx.fillStyle = g
                ctx.fillRect(0, Math.min(op.y0, op.y1), THUMB_W, Math.abs(op.y1 - op.y0))
                break
            }
            case 'rect': {
                if (op.skew) {
                    const cy = op.y + op.h / 2
                    ctx.transform(1, 0, -Math.tan((10 * Math.PI) / 180), 1, Math.tan((10 * Math.PI) / 180) * cy, 0)
                }
                ctx.beginPath()
                ctx.roundRect(op.x, op.y, op.w, op.h, op.r)
                ctx.globalAlpha = op.alpha ?? 1
                ctx.fillStyle = op.fill
                ctx.shadowColor = 'rgba(0,0,0,0.45)'
                ctx.shadowBlur = 18
                ctx.shadowOffsetY = 5
                ctx.fill()
                ctx.shadowColor = 'transparent'
                ctx.globalAlpha = 1
                if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lineWidth ?? 4; ctx.stroke() }
                break
            }
            case 'text': {
                ctx.font = op.font(op.size)
                ctx.textAlign = op.align
                ctx.textBaseline = 'alphabetic'
                // Centre on the capitals' real ink box rather than a guessed baseline.
                const m = ctx.measureText('H0')
                const asc = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : op.size * 0.7
                const desc = Math.max(0, m.actualBoundingBoxDescent || 0)
                ctx.fillStyle = op.color
                ctx.shadowColor = 'rgba(0,0,0,0.5)'
                ctx.shadowBlur = 10
                ctx.shadowOffsetY = 3
                if (op.maxWidth) ctx.fillText(op.text, op.x, op.y + (asc - desc) / 2, op.maxWidth)
                else ctx.fillText(op.text, op.x, op.y + (asc - desc) / 2)
                break
            }
            case 'logo': {
                if (!logo) break
                const w = (logo.width / logo.height) * op.h
                ctx.shadowColor = 'rgba(0,0,0,0.5)'
                ctx.shadowBlur = 14
                ctx.drawImage(logo, op.x, op.y, w, op.h)
                break
            }
        }
        ctx.restore()
    }
}
