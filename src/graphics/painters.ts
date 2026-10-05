// Turns a graphics spec (plain data) into the engine's painters.
import type { RenderGraphics, RenderOverlay } from '../render/types'
import { CARD_SEC, cardLayout, lowerThirdLayout, replayTagLayout } from './layout'
import { designFit, paintOps, type PaintAssets } from './paint'
import type { CardSpec, GraphicsSpec, OverlaySpec } from './types'

/** Design-space rows each overlay kind can touch (with room for anti-aliasing). */
const ROWS: Record<OverlaySpec['kind'], [number, number]> = { lowerThird: [770, 976], replayTag: [56, 136] }

function card(spec: CardSpec, label: string, assets: PaintAssets) {
    return { label, durationSec: CARD_SEC, paint: (ctx: OffscreenCanvasRenderingContext2D, t: number) => paintOps(ctx, cardLayout(spec, t, CARD_SEC, !!assets.logo), assets) }
}

export function toRenderGraphics(spec: GraphicsSpec, assets: PaintAssets): RenderGraphics {
    const overlays: RenderOverlay[] = spec.overlays.map((o) => ({
        label: o.label,
        cutIndex: o.cutIndex,
        startSec: o.startSec,
        durationSec: o.durationSec,
        rows: (w, h) => { const { s, oy } = designFit(w, h); return [oy + ROWS[o.kind][0] * s, oy + ROWS[o.kind][1] * s] },
        paint: o.kind === 'lowerThird'
            ? (ctx, t) => paintOps(ctx, lowerThirdLayout(o.spec, t, !!assets.logo, o.durationSec), assets)
            : (ctx, t) => paintOps(ctx, replayTagLayout(t, o.durationSec), assets),
    }))
    return {
        ...(spec.intro ? { intro: card(spec.intro, 'Title card', assets) } : {}),
        ...(spec.outro ? { outro: card(spec.outro, 'Full-time card', assets) } : {}),
        overlays,
    }
}
