import { C } from './themes/shooot/brandColors'
import { stingFrame } from './layout'
import type { Ctx, PaintAssets } from './paint'

/** The end sting: Night Turf ground with the Shooot wordmark easing in and out (brand mark, same in every theme). */
export function paintSting(ctx: Ctx, t: number, d: number, assets: PaintAssets): void {
    // No wordmark would mean a blank card reported as applied: fail so the render lists the sting under "Rendered without".
    if (!assets.wordmark) throw new Error('the Shooot wordmark could not be loaded')
    const { width: W, height: H } = ctx.canvas
    ctx.fillStyle = C.ground
    ctx.fillRect(0, 0, W, H)
    const mark = assets.wordmark
    const { alpha, scale } = stingFrame(t, d)
    const w = W * 0.42 * scale
    const h = w * (mark.height / mark.width)
    ctx.globalAlpha = alpha
    ctx.drawImage(mark, (W - w) / 2, (H - h) / 2, w, h)
    ctx.globalAlpha = 1
}
