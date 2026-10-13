// Experiment 6: how much footage the stream-copy (Original) highlights re-encode around graphics, and whether trimming it to
// the part of each overlay that is really visible saves anything.
//
// How the engine decides (mediabunnyEngine.renderCut -> overlayRegions / graphicsSession.overlayCut -> overlayWindow.overlaySpans):
//  - every overlay has a window [startSec, startSec + durationSec] of source time (captions 5 s from 1 s after the goal, carried on into the
//    replay; the REPLAY tag the whole replay cut; a score bug window its whole cut piece);
//  - GOPs are never split: the span starts at the GOP that contains the window start (one GOP earlier is decoded, not re-encoded, when a key
//    has leading pictures) and ends at the first key frame at/after the window end; touching spans merge;
//  - every frame of the span is decoded, painted (only the overlay rows are blended) and re-encoded; the rest of the cut is copied.
// So a closed-GOP source (GoPro, 1 s GOPs) already re-encodes the minimum number of whole GOPs for a given window. The variant cuts each
// window down to the part where the painter changes a pixel (probed), which can only help when a window is padded beyond what is drawn.
import { prepareSpec } from '../../graphics/prepare'
import type { RenderTimeline } from '../../render/types'
import { clearKept, grabFrame, highlightsPlan, excerptLen, keepCopy, meanAbsDiff, pair, run, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

export async function tightSpansRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown> }> {
    const len = excerptLen(ctx)
    const plan = highlightsPlan(ctx, len, 1, false)
    const graphics = await prepareSpec(plan.spec)
    if (!graphics) throw new Error('the plan has no graphics')
    const runs: Record<'baseline' | 'variant', { file: File | Blob; timeline: RenderTimeline | null; stats: Record<string, unknown> | null } | null> = { baseline: null, variant: null }
    const go = (tight: boolean) => async () => {
        const r = await run(ctx, plan.cuts, { graphics, extra: { ...(tight ? { experiments: { tightSpans: true } } : {}) } })
        // Keep the output for the frame check (it is deleted with the rest after the pair).
        const kept = await keepCopy(r.file, `tight-${tight ? 'variant' : 'baseline'}.mp4`)
        runs[tight ? 'variant' : 'baseline'] = { file: kept, timeline: r.timeline, stats: r.rendering.stats }
        const s = r.rendering.stats as { reencodedSourceSec?: number; overlayWindowSec?: number; overlaySpans?: number } | null
        return { wallMs: r.wallMs, bytes: r.bytes, detail: { ...(s ?? {}) }, notes: s ? [`re-encoded ${s.reencodedSourceSec} s of footage for ${s.overlayWindowSec} s of overlay windows in ${s.overlaySpans} spans`] : [] }
    }
    const row = await pair('Original highlights (one goal: caption, replay, REPLAY tag)', ['whole windows', 'visible part only'], go(false), go(true))
    const detail: Record<string, unknown> = {}
    // Does the caption still appear at the right time? Compare pictures of both outputs at, before and during each caption.
    try {
        const b = runs.baseline
        const v = runs.variant
        if (b && v && b.timeline && v.timeline) {
            const W = 960
            const H = Math.round((W * ctx.probe.height) / ctx.probe.width / 2) * 2
            const rect = { x: 0, y: 0, w: Math.round(W * 0.72), h: Math.round(H * 0.26) }
            const checks: Record<string, unknown>[] = []
            for (const o of plan.spec?.overlays.filter((x) => x.kind === 'caption') ?? []) {
                const tl = b.timeline[o.cutIndex]
                const tv = v.timeline[o.cutIndex]
                if (!tl || !tv) continue
                const speed = plan.cuts[o.cutIndex].speed ?? 1
                const outAt = (t: typeof tl): number => t.outStartSec + (o.startSec - t.sourceStartSec) / speed
                const at = (t: typeof tl, dt: number): number => Math.max(0.1, outAt(t) + dt)
                const spots: [string, number][] = [['before', -0.6], ['early', 0.2], ['middle', Math.min(o.durationSec / speed, 5) / 2], ['late', Math.min(o.durationSec / speed, 5) - 0.3]]
                const frames: Record<string, unknown> = {}
                const base0 = await grabFrame(b.file, 'b.mp4', at(tl, spots[0][1]), W, H)
                for (const [name, dt] of spots) {
                    const fb = await grabFrame(b.file, 'b.mp4', at(tl, dt), W, H)
                    const fv = await grabFrame(v.file, 'v.mp4', at(tv, dt), W, H)
                    frames[name] = { baselineVsVariant: +meanAbsDiff(fb, fv, rect).toFixed(2), captionBandVsBefore: +meanAbsDiff(fb, base0, rect).toFixed(2), variantBandVsBefore: +meanAbsDiff(fv, await grabFrame(v.file, 'v.mp4', at(tv, spots[0][1]), W, H), rect).toFixed(2) }
                }
                checks.push({ caption: o.label, outStartSec: +outAt(tl).toFixed(2), frames })
            }
            detail.frameChecks = checks
            detail.frameCheckNote = 'baselineVsVariant = mean abs difference of the caption band between the two outputs at the same output time (small = same picture); captionBandVsBefore = how much that band changed against the frame 0.6 s before the caption (large = caption visible).'
        }
    } catch (e) {
        detail.frameCheckError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
    } finally {
        await clearKept()
    }
    return { rows: [row], notes: ['See the comment at the top of experiments/tightSpans.ts for how the engine picks the re-encoded span.'], detail }
}
