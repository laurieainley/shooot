// Experiment 5: draw captions, the score bug and the REPLAY tag from cached bitmaps instead of painting them on every frame.
import { OverlayBitmapCache } from '../../graphics/overlayCache'
import { prepareSpec } from '../../graphics/prepare'
import type { RenderGraphics, RenderOverlay } from '../../render/types'
import { bitrateFor, grabFrame, highlightsPlan, matchPlan, excerptLen, pair, run, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)

/** One overlay per kind (caption, replay tag, score bug) that is long enough to have a still stretch. */
function sampleOverlays(g: RenderGraphics): { name: string; index: number; o: RenderOverlay }[] {
    const pick = (name: string, test: (o: RenderOverlay) => boolean): { name: string; index: number; o: RenderOverlay } | null => {
        const index = g.overlays.findIndex(test)
        return index >= 0 ? { name, index, o: g.overlays[index] } : null
    }
    return [
        pick('caption', (o) => o.label.startsWith('Caption') && o.durationSec >= 2),
        pick('replayTag', (o) => o.label === 'Replay tag'),
        pick('scoreBug', (o) => o.label === 'Score bug' && o.durationSec >= 3),
    ].filter((x): x is { name: string; index: number; o: RenderOverlay } => !!x)
}

async function microbench(g: RenderGraphics, w: number, h: number, frames: number): Promise<number> {
    const canvas = new OffscreenCanvas(w, h)
    const c = canvas.getContext('2d')!
    const list = sampleOverlays(g)
    const t0 = performance.now()
    for (let i = 0; i < frames; i++) {
        c.clearRect(0, 0, w, h)
        for (const { o } of list) {
            const lo = 0.5
            const hi = Math.max(lo, Math.min(o.durationSec - 0.5, 3.5))
            const t = lo + ((i / 30) % Math.max(0.01, hi - lo))
            c.save(); o.paint(c, t); c.restore()
        }
        c.getImageData(0, 0, 1, 1) // finishes the drawing, so the time is the real cost
        if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    return performance.now() - t0
}

type Diff = { maxChannelDiff: number; meanAbsDiff: number; pctPixelsDifferent: number; pctPixelsOver2: number }

function diffOf(a: ImageData, b: ImageData): { diff: Diff; amplified: ImageData } {
    let max = 0, sum = 0, ne = 0, over = 0
    const amp = new ImageData(a.width, a.height)
    for (let i = 0; i < a.data.length; i += 4) {
        let px = 0
        for (let k = 0; k < 3; k++) {
            const d = Math.abs(a.data[i + k] - b.data[i + k])
            px = Math.max(px, d)
            sum += d
            amp.data[i + k] = Math.min(255, d * 32)
        }
        amp.data[i + 3] = 255
        max = Math.max(max, px)
        if (px > 0) ne++
        if (px > 2) over++
    }
    const n = a.width * a.height
    return { diff: { maxChannelDiff: max, meanAbsDiff: +(sum / (n * 3)).toFixed(4), pctPixelsDifferent: +((ne / n) * 100).toFixed(4), pctPixelsOver2: +((over / n) * 100).toFixed(4) }, amplified: amp }
}

async function visualCompare(ctx: ExpCtx, plain: RenderGraphics, cached: RenderGraphics, startSec: number): Promise<Record<string, unknown>> {
    const W = 1920
    const H = even((W * ctx.probe.height) / ctx.probe.width)
    const bg = await grabFrame(ctx.source.file, ctx.source.name, startSec, W, H)
    const a = sampleOverlays(plain)
    const b = sampleOverlays(cached)
    const out: Record<string, unknown> = {}
    for (let k = 0; k < a.length; k++) {
        const cases: [string, number][] = a[k].name === 'caption'
            ? [['hold', Math.min(2, a[k].o.durationSec * 0.6)], ['fadeIn', 0.12], ['fadeOut (last caption part)', -1]]
            : a[k].name === 'scoreBug' ? [['hold', Math.min(2, a[k].o.durationSec / 2)]] : [['hold', 1]]
        for (const [phase, t0] of cases) {
            let t = t0
            let oa = a[k].o
            let ob = b[k].o
            if (t0 < 0) {
                // The last caption part is the one that fades out.
                const lastA = [...plain.overlays].reverse().find((o) => o.label.startsWith('Caption'))!
                const lastB = [...cached.overlays].reverse().find((o) => o.label.startsWith('Caption'))!
                oa = lastA; ob = lastB; t = Math.max(0.05, lastA.durationSec - 0.12)
            }
            const draw = (o: RenderOverlay, twice: boolean): ImageData => {
                const c = new OffscreenCanvas(W, H)
                const x = c.getContext('2d', { willReadFrequently: true })!
                x.putImageData(bg, 0, 0)
                x.save(); o.paint(x, t); x.restore()
                if (twice) { x.putImageData(bg, 0, 0); x.save(); o.paint(x, t); x.restore() } // the second call is the one that comes from the cache
                return x.getImageData(0, 0, W, H)
            }
            const plainImg = draw(oa, false)
            const cachedImg = draw(ob, true)
            const { diff, amplified } = diffOf(plainImg, cachedImg)
            out[`${a[k].name} ${phase}`] = diff
            if (a[k].name === 'caption' && phase === 'hold') {
                const png = async (img: ImageData, name: string): Promise<void> => {
                    const c = new OffscreenCanvas(W, H)
                    c.getContext('2d')!.putImageData(img, 0, 0)
                    ctx.addArtifact(name, await c.convertToBlob({ type: 'image/png' }))
                }
                await png(plainImg, 'overlay-caption-painted.png')
                await png(cachedImg, 'overlay-caption-cached.png')
                await png(amplified, 'overlay-caption-diff-x32.png')
            }
        }
    }
    return out
}

export async function overlayCacheRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown> }> {
    const len = excerptLen(ctx)
    const rows: ExperimentRow[] = []
    const detail: Record<string, unknown> = {}
    const match = matchPlan(ctx, len, true)
    const high = highlightsPlan(ctx, len, 1, false)
    const plain = await prepareSpec(match.spec)
    const cache = new OverlayBitmapCache()
    const cachedG = await prepareSpec(match.spec, cache)
    if (!plain || !cachedG) throw new Error('the plan has no graphics')
    try {
        // 1. Painting cost per frame.
        const N = 120
        const sizes: [string, number, number][] = [['1080p', 1920, 1080]]
        if (Math.max(ctx.probe.width, ctx.probe.height) >= 3824) sizes.push(['4K', 3840, 2160])
        for (const [name, w, h] of sizes) {
            let bestPlain = 0, bestCached = 0
            const row = await pair(`paint ${name}: ${N} frames of caption + tag + bug`, ['painted each frame', 'cached bitmaps'], async () => {
                const ms = await microbench(plain, w, h, N); bestPlain = ms; return { wallMs: ms }
            }, async () => {
                const ms = await microbench(cachedG, w, h, N); bestCached = ms
                return { wallMs: ms, detail: cache.stats() as unknown as Record<string, unknown> }
            })
            row.note = `${(bestPlain / N).toFixed(2)} -> ${(bestCached / N).toFixed(2)} ms per frame`
            rows.push(row)
        }
        // 2. Whole renders.
        // (4K is covered by the paint micro-benchmark above: a 4K render per variant would add minutes for little extra information.)
        const renders: [string, '1080p' | '4k' | null, typeof match][] = [['1080p re-encode with graphics', '1080p', match]]
        renders.push(['Original highlights', null, high])
        for (const [label, quality, plan] of renders) {
            const c = new OverlayBitmapCache()
            const [g0, g1] = [await prepareSpec(plan.spec), await prepareSpec(plan.spec, c)]
            const go = (g: typeof g0, cc: OverlayBitmapCache | null) => async () => {
                const r = await run(ctx, plan.cuts, { ...(quality ? { quality, bitrate: bitrateFor(quality) } : {}), ...(g ? { graphics: g } : {}) })
                return { wallMs: r.wallMs, bytes: r.bytes, detail: { ...(cc ? { cache: cc.stats() } : {}), ...(r.rendering.stats ? { stats: r.rendering.stats } : {}) } }
            }
            const row = await pair(label, ['painted each frame', 'cached bitmaps'], go(g0, null), go(g1, c))
            const st = c.stats()
            row.note = `${st.hits} cache hits, ${st.misses} misses (${st.stillMisses} on still stretches)`
            c.dispose()
            rows.push(row)
        }
        // 3. Do they look the same?
        try {
            detail.visualDiff = await visualCompare(ctx, plain, cachedG, (match.spec?.overlays.find((o) => o.kind === 'caption')?.startSec ?? 5))
        } catch (e) {
            detail.visualDiffError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
        }
    } finally {
        cache.dispose()
    }
    return { rows, notes: ['Overlays are cached as a bitmap of their rows once per size; only the 0.3 s fades are painted per frame. PNGs: overlay-caption-*.png.'], detail }
}
