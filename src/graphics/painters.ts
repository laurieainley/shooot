// Turns a graphics spec (plain data) into the engine's painters, using the spec's theme.
import type { RenderGraphics, RenderOverlay } from '../render/types'
import { CARD_SEC, INTRO_SEC, OVERLAY_FADE, STING_SEC, cardFade } from './layout'
import type { OverlayBitmapCache } from './overlayCache'
import { designFit, type PaintAssets } from './paint'
import { paintSting } from './sting'
import { getTheme, type GraphicsTheme } from './themes'
import { isSting, type CardSpec, type GraphicsSpec, type OverlaySpec } from './types'

type Painter = (ctx: OffscreenCanvasRenderingContext2D, t: number) => void

const rowsFor = (kind: OverlaySpec['kind'], theme: GraphicsTheme) => (w: number, h: number): [number, number] => {
    const { s, oy } = designFit(w, h)
    const r = ({ caption: theme.rows.caption, replayTag: theme.rows.replay, scoreBug: theme.rows.bug })[kind]
    return [oy + r[0] * s, oy + r[1] * s]
}

function painter(o: OverlaySpec, assets: PaintAssets, theme: GraphicsTheme, cache?: OverlayBitmapCache): Painter {
    const bugAt = (t: number) => {
        if (o.kind !== 'scoreBug') return undefined
        const at = o.startSec + t
        let bug = o.scores[0]?.bug
        for (const s of o.scores) if (s.fromSec <= at + 1e-6) bug = s.bug
        return bug
    }
    switch (o.kind) {
        case 'caption': {
            const draw = (ctx: OffscreenCanvasRenderingContext2D, tc: number): void => theme.paintCaption(ctx, o.spec, tc, o.clock.totalSec, assets)
            if (!cache) return (ctx, t) => draw(ctx, o.clock.offsetSec + t * o.clock.rate)
            const total = o.clock.totalSec
            return cache.painter({
                id: o.label + '#' + o.cutIndex + '@' + o.startSec, rows: rowsFor('caption', theme), draw, clock: (t) => o.clock.offsetSec + t * o.clock.rate,
                still: total > 2 * OVERLAY_FADE + 0.05 ? { from: OVERLAY_FADE, to: total - OVERLAY_FADE } : null,
            })
        }
        case 'replayTag': {
            const draw = (ctx: OffscreenCanvasRenderingContext2D, t: number): void => theme.paintReplayTag(ctx, t, o.durationSec, o.speed, assets)
            if (!cache) return (ctx, t) => draw(ctx, t)
            // The tag appears and disappears instantly: one picture for the whole replay.
            return cache.painter({ id: 'replayTag#' + o.cutIndex, rows: rowsFor('replayTag', theme), draw, clock: (t) => t, still: { from: -1e9, to: 1e9 } })
        }
        case 'scoreBug': {
            const draw = (ctx: OffscreenCanvasRenderingContext2D, t: number): void => {
                const bug = bugAt(t)
                if (bug) theme.paintScoreBug(ctx, bug, t, o.durationSec, { in: o.fadeIn, out: o.fadeOut }, assets)
            }
            if (!cache) return (ctx, t) => draw(ctx, t)
            const from = o.fadeIn ? OVERLAY_FADE : -1e9
            const to = o.fadeOut ? o.durationSec - OVERLAY_FADE : 1e9
            return cache.painter({
                id: 'scoreBug#' + o.cutIndex + '@' + o.startSec, rows: rowsFor('scoreBug', theme), draw, clock: (t) => t,
                still: to > from ? { from, to } : null, variant: (t) => bugAt(t)?.text ?? '',
            })
        }
    }
}

function card(spec: CardSpec, label: string, assets: PaintAssets, theme: GraphicsTheme, sec: number) {
    // Drawn once fully visible; the engine applies the fade (cheaper than converting every frame).
    return {
        label, durationSec: sec,
        paint: (ctx: OffscreenCanvasRenderingContext2D) => theme.paintCard(ctx, spec, sec / 2, sec, assets),
        fade: (t: number) => cardFade(t, sec),
    }
}

function sting(assets: PaintAssets) {
    // Animated per frame (no `fade`): the wordmark eases itself in and out.
    return { label: 'Shooot sting', durationSec: STING_SEC, paint: (ctx: OffscreenCanvasRenderingContext2D, t: number) => paintSting(ctx, t, STING_SEC, assets) }
}

export function toRenderGraphics(spec: GraphicsSpec, assets: PaintAssets, cache?: OverlayBitmapCache): RenderGraphics {
    const theme = getTheme(spec.theme)
    const rowsOf = (kind: OverlaySpec['kind']): [number, number] => ({ caption: theme.rows.caption, replayTag: theme.rows.replay, scoreBug: theme.rows.bug })[kind]
    const overlays: RenderOverlay[] = spec.overlays.map((o) => ({
        label: o.label,
        cutIndex: o.cutIndex,
        startSec: o.startSec,
        durationSec: o.durationSec,
        rows: (w, h) => { const { s, oy } = designFit(w, h); const r = rowsOf(o.kind); return [oy + r[0] * s, oy + r[1] * s] },
        paint: painter(o, assets, theme, cache),
        ...(o.kind === 'scoreBug' && !o.fadeIn && !o.fadeOut ? { anchor: 'wholeCut' as const } : {}),
        ...(o.kind === 'caption' && o.fromCutStart ? { anchor: 'fromCutStart' as const } : {}),
        ...(o.kind === 'caption' && o.toCutEnd ? { anchor: 'toCutEnd' as const } : {}),
        ...(o.kind === 'caption' && o.fromCutStart && o.clock.offsetSec > 0 ? { follows: o.clock } : {}),
        ...(o.kind === 'replayTag' ? { anchor: 'stretchToCut' as const } : {}),
    }))
    return {
        ...(spec.intro ? { intro: card(spec.intro, 'Title card', assets, theme, INTRO_SEC) } : {}),
        ...(spec.outro ? { outro: isSting(spec.outro) ? sting(assets) : card(spec.outro, 'Full-time card', assets, theme, CARD_SEC) } : {}),
        overlays,
    }
}
