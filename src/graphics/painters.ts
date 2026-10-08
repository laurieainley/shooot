// Turns a graphics spec (plain data) into the engine's painters, using the spec's theme.
import type { RenderGraphics, RenderOverlay } from '../render/types'
import { CARD_SEC, cardFade } from './layout'
import { designFit, type PaintAssets } from './paint'
import { getTheme, type GraphicsTheme } from './themes'
import type { CardSpec, GraphicsSpec, OverlaySpec } from './types'

type Painter = (ctx: OffscreenCanvasRenderingContext2D, t: number) => void

function painter(o: OverlaySpec, assets: PaintAssets, theme: GraphicsTheme): Painter {
    switch (o.kind) {
        case 'caption':
            return (ctx, t) => theme.paintCaption(ctx, o.spec, o.clock.offsetSec + t * o.clock.rate, o.clock.totalSec, assets)
        case 'replayTag':
            return (ctx, t) => theme.paintReplayTag(ctx, t, o.durationSec, o.speed, assets)
        case 'scoreBug':
            return (ctx, t) => {
                const at = o.startSec + t
                let bug = o.scores[0]?.bug
                for (const s of o.scores) if (s.fromSec <= at + 1e-6) bug = s.bug
                if (bug) theme.paintScoreBug(ctx, bug, t, o.durationSec, { in: o.fadeIn, out: o.fadeOut }, assets)
            }
    }
}

function card(spec: CardSpec, label: string, assets: PaintAssets, theme: GraphicsTheme) {
    // Drawn once fully visible; the engine applies the fade (cheaper than converting every frame).
    return {
        label, durationSec: CARD_SEC,
        paint: (ctx: OffscreenCanvasRenderingContext2D) => theme.paintCard(ctx, spec, CARD_SEC / 2, CARD_SEC, assets),
        fade: (t: number) => cardFade(t, CARD_SEC),
    }
}

export function toRenderGraphics(spec: GraphicsSpec, assets: PaintAssets): RenderGraphics {
    const theme = getTheme(spec.theme)
    const rowsOf = (kind: OverlaySpec['kind']): [number, number] => ({ caption: theme.rows.caption, replayTag: theme.rows.replay, scoreBug: theme.rows.bug })[kind]
    const overlays: RenderOverlay[] = spec.overlays.map((o) => ({
        label: o.label,
        cutIndex: o.cutIndex,
        startSec: o.startSec,
        durationSec: o.durationSec,
        rows: (w, h) => { const { s, oy } = designFit(w, h); const r = rowsOf(o.kind); return [oy + r[0] * s, oy + r[1] * s] },
        paint: painter(o, assets, theme),
        ...(o.kind === 'scoreBug' && !o.fadeIn && !o.fadeOut ? { anchor: 'wholeCut' as const } : {}),
        ...(o.kind === 'caption' && o.fromCutStart ? { anchor: 'fromCutStart' as const } : {}),
        ...(o.kind === 'caption' && o.toCutEnd ? { anchor: 'toCutEnd' as const } : {}),
        ...(o.kind === 'caption' && o.fromCutStart && o.clock.offsetSec > 0 ? { follows: o.clock } : {}),
        ...(o.kind === 'replayTag' ? { anchor: 'stretchToCut' as const } : {}),
    }))
    return {
        ...(spec.intro ? { intro: card(spec.intro, 'Title card', assets, theme) } : {}),
        ...(spec.outro ? { outro: card(spec.outro, 'Full-time card', assets, theme) } : {}),
        overlays,
    }
}
