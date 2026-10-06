// Turns a graphics spec (plain data) into the engine's painters.
import type { RenderGraphics, RenderOverlay } from '../render/types'
import { BUG_ROWS, CAPTION_ROWS, CARD_SEC, REPLAY_ROWS, captionLayout, cardFade, cardLayout, replayTagLayout, scoreBugLayout } from './layout'
import { designFit, measureWith, paintOps, type PaintAssets } from './paint'
import type { CardSpec, GraphicsSpec, OverlaySpec } from './types'

/** Design-space rows each overlay kind can touch (with room for anti-aliasing). */
const ROWS: Record<OverlaySpec['kind'], [number, number]> = { caption: CAPTION_ROWS, replayTag: REPLAY_ROWS, scoreBug: BUG_ROWS }

type Painter = (ctx: OffscreenCanvasRenderingContext2D, t: number) => void

function painter(o: OverlaySpec, assets: PaintAssets): Painter {
    const logo = !!assets.logo
    switch (o.kind) {
        case 'caption':
            return (ctx, t) => paintOps(ctx, captionLayout(o.spec, o.clock.offsetSec + t * o.clock.rate, logo, o.clock.totalSec, measureWith(ctx)), assets)
        case 'replayTag':
            return (ctx, t) => paintOps(ctx, replayTagLayout(t, o.durationSec, measureWith(ctx)), assets)
        case 'scoreBug':
            return (ctx, t) => {
                const at = o.startSec + t
                let bug = o.scores[0]?.bug
                for (const s of o.scores) if (s.fromSec <= at + 1e-6) bug = s.bug
                if (bug) paintOps(ctx, scoreBugLayout(bug, t, o.durationSec, logo, { in: o.fadeIn, out: o.fadeOut }, measureWith(ctx)), assets)
            }
    }
}

function card(spec: CardSpec, label: string, assets: PaintAssets) {
    // Drawn once fully visible; the engine applies the fade (cheaper than converting every frame).
    return {
        label, durationSec: CARD_SEC,
        paint: (ctx: OffscreenCanvasRenderingContext2D) => paintOps(ctx, cardLayout(spec, CARD_SEC / 2, CARD_SEC, !!assets.logo), assets),
        fade: (t: number) => cardFade(t, CARD_SEC),
    }
}

export function toRenderGraphics(spec: GraphicsSpec, assets: PaintAssets): RenderGraphics {
    const overlays: RenderOverlay[] = spec.overlays.map((o) => ({
        label: o.label,
        cutIndex: o.cutIndex,
        startSec: o.startSec,
        durationSec: o.durationSec,
        rows: (w, h) => { const { s, oy } = designFit(w, h); return [oy + ROWS[o.kind][0] * s, oy + ROWS[o.kind][1] * s] },
        paint: painter(o, assets),
        ...(o.kind === 'scoreBug' && !o.fadeIn && !o.fadeOut ? { anchor: 'wholeCut' as const } : {}),
        ...(o.kind === 'caption' && o.fromCutStart ? { anchor: 'fromCutStart' as const } : {}),
        ...(o.kind === 'caption' && o.toCutEnd ? { anchor: 'toCutEnd' as const } : {}),
        ...(o.kind === 'caption' && o.fromCutStart && o.clock.offsetSec > 0 ? { follows: o.clock } : {}),
        ...(o.kind === 'replayTag' ? { anchor: 'stretchToCut' as const } : {}),
    }))
    return {
        ...(spec.intro ? { intro: card(spec.intro, 'Title card', assets) } : {}),
        ...(spec.outro ? { outro: card(spec.outro, 'Full-time card', assets) } : {}),
        overlays,
    }
}
