// Experiment 11: scale (4K -> 1080p) and composite the graphics with WebGPU, against the current path (encoder scaling on
// iPad/Mac, WebGL on the Pixel where encoder scaling is unusable, WebGL for frames with graphics).
import { VideoSampleSink } from 'mediabunny'
import { prepareSpec } from '../../graphics/prepare'
import { GlScaler } from '../../render/downscale'
import { GpuScaler, type GpuInfo } from '../../render/gpuScaler'
import { openSource } from '../../render/sourceInput'
import type { RenderGraphics } from '../../render/types'
import { bitrateFor, excerptLen, grabFrame, matchPlan, meanAbsDiff, pair, plainPlan, run, verifyOutput, type ExpCtx, type Measure } from '../expCommon'
import type { ExperimentRow } from '../results'

const NAMES: [string, string] = ['current path', 'WebGPU']

/** The "time breakdown" of a render in seconds, as the pipeline experiment reports it. */
export function breakdownSec(s: Record<string, unknown> | null | undefined): Record<string, number> {
    const sec = (v: unknown): number => +(((typeof v === 'number' ? v : 0) / 1000)).toFixed(1)
    return { decodeWait: sec(s?.decodeWaitMs), paintAndScale: sec(s?.paintMs), encodeCall: sec(s?.encodeCallMs), backpressure: sec(s?.backpressureMs), packetWrites: sec(s?.drainMs) }
}

/** Milliseconds per frame, rounded for display. */
export const msPerFrame = (totalMs: number, frames: number): number => +(totalMs / Math.max(1, frames)).toFixed(2)

type Shot = { img: ImageData | null }

async function microbench(ctx: ExpCtx, graphics: RenderGraphics | null, frames: number): Promise<{ rows: ExperimentRow[]; note: string }> {
    const W = 1920
    const H = 1080
    // One decoded picture of the source, reused for every frame so only scale + paint is timed.
    const o = await openSource({ name: ctx.source.name, file: ctx.source.file })
    let vf: VideoFrame | null = null
    try {
        const sample = await new VideoSampleSink(o.video).getSample(1)
        if (!sample) throw new Error('no picture to scale')
        try { vf = sample.toVideoFrame() } finally { sample.close() }
    } finally { o.input.dispose() }
    const src = vf
    const overlays = (graphics?.overlays ?? []).filter((x) => (x.label.startsWith('Caption') && x.durationSec >= 2) || (x.label === 'Score bug' && x.durationSec >= 3)).slice(0, 2)
    const paint = overlays.length ? (c: OffscreenCanvasRenderingContext2D): void => { for (const x of overlays) { c.save(); x.paint(c, Math.min(1.5, x.durationSec / 2)); c.restore() } } : null
    const rect = { sx: 0, sy: 0, sw: src.displayWidth, sh: src.displayHeight }
    let glMs = 0
    try {
        const row = await pair(`micro: ${frames} frames scale + paint only (${src.displayWidth}x${src.displayHeight} -> ${W}x${H}${paint ? ', captions + score bug' : ''})`, ['WebGL + 2D canvas', 'WebGPU'], async () => {
            const gl = GlScaler.create(W, H)
            const c2 = new OffscreenCanvas(W, H)
            const x = c2.getContext('2d')!
            if (!gl) throw new Error('no WebGL2')
            try {
                const t0 = performance.now()
                for (let i = 0; i < frames; i++) {
                    gl.draw(src, rect.sx, rect.sy, rect.sw, rect.sh)
                    x.drawImage(gl.canvas, 0, 0)
                    if (paint) paint(x)
                    new VideoFrame(c2, { timestamp: i * 33333 }).close()
                }
                glMs = performance.now() - t0
                return { wallMs: glMs, detail: { msPerFrame: msPerFrame(glMs, frames) } }
            } finally { gl.dispose() }
        }, async () => {
            const made = await GpuScaler.create(W, H)
            if (!made.scaler) throw new Error(`WebGPU unavailable: ${made.reason}`)
            const g = made.scaler
            try {
                const t0 = performance.now()
                for (let i = 0; i < frames; i++) g.frame(src, rect, paint, i * 33333, 33333).close()
                const ms = performance.now() - t0
                return { wallMs: ms, detail: { msPerFrame: msPerFrame(ms, frames) } }
            } finally { g.dispose() }
        })
        if (row.baselineMs !== undefined && row.variantMs !== undefined) row.note = `${msPerFrame(row.baselineMs, frames)} -> ${msPerFrame(row.variantMs, frames)} ms per frame`
        return { rows: [row], note: '' }
    } finally { src.close() }
}

export async function webgpuRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown>; unsupported?: string }> {
    const probe = await GpuScaler.create(1920, 1080)
    const detail: Record<string, unknown> = { adapter: probe.info }
    if (!probe.scaler) return { rows: [], notes: [], detail, unsupported: probe.reason }
    probe.scaler.dispose()
    const len = excerptLen(ctx)
    const rows: ExperimentRow[] = []
    const plain = plainPlan(len)
    const plan = matchPlan(ctx, len, false)
    const graphics = (await prepareSpec(plan.spec)) ?? null
    const capStart = plan.spec?.overlays.find((o) => o.kind === 'caption')?.startSec ?? 5
    const shotAt = capStart + 1.5

    const render = (cuts: typeof plain.cuts, quality: '1080p' | '4k', g: RenderGraphics | null, webgpu: boolean, shot?: Shot, shotSize?: [number, number]) => async (): Promise<Measure> => {
        const r = await run(ctx, cuts, { quality, bitrate: bitrateFor(quality), ...(g ? { graphics: g } : {}), ...(webgpu ? { extra: { experiments: { scaler: 'webgpu' } } } : {}) })
        const stats = r.rendering.stats
        const diagNotes = r.rendering.diagnostics?.notes ?? []
        const path = diagNotes.filter((n) => /^(Scale path|WebGPU)/.test(n))
        const d: Record<string, unknown> = { breakdownSec: breakdownSec(stats), frames: stats?.frames, gpuFrames: stats?.gpuFrames, scalePath: stats?.scalePath, pathNotes: path }
        const notes: string[] = []
        if (webgpu) {
            if (!stats?.gpuFrames) throw new Error(`WebGPU path did not run: ${path.join(' | ') || 'no diagnostics'}`)
            notes.push(`${stats.gpuFrames} of ${stats.frames} frames by WebGPU`)
            d.outputCheck = await verifyOutput(r.file, 'webgpu.mp4', [])
        } else notes.push(`current: ${stats?.scalePath ?? path.find((n) => n.startsWith('Scale path')) ?? 'no scaling'}`)
        if (shot && shotSize) shot.img = await grabFrame(r.file, 'out.mp4', shotAt, shotSize[0], shotSize[1])
        return { wallMs: r.wallMs, bytes: r.bytes, detail: d, notes }
    }

    // 1. No graphics: only scaling.
    rows.push(await pair('1080p, no graphics (scaling only)', NAMES, render(plain.cuts, '1080p', null, false), render(plain.cuts, '1080p', null, true)))
    // 2. Captions + score bug at 1080p, with a picture compared between the two.
    if (graphics) {
        const a: Shot = { img: null }
        const b: Shot = { img: null }
        const row = await pair('1080p, captions + score bug', NAMES, render(plan.cuts, '1080p', graphics, false, a, [1920, 1080]), render(plan.cuts, '1080p', graphics, true, b, [1920, 1080]))
        if (a.img && b.img) {
            const diff = meanAbsDiff(a.img, b.img)
            const W = a.img.width
            const H = a.img.height
            // Regions and a signed bias tell a colour-handling difference (uniform offset) from a placement or overlay difference.
            const top = meanAbsDiff(a.img, b.img, { x: 0, y: 0, w: W, h: Math.floor(H / 2) })
            const bottom = meanAbsDiff(a.img, b.img, { x: 0, y: Math.floor(H * 0.75), w: W, h: H - Math.floor(H * 0.75) })
            const bias = [0, 1, 2].map((k) => { let t = 0; for (let i = 0; i < a.img!.data.length; i += 4) t += b.img!.data[i + k] - a.img!.data[i + k]; return +(t / (W * H)).toFixed(2) })
            detail.visualDiff = { atSec: shotAt, size: '1920x1080', meanAbsDiff: +diff.toFixed(3), topHalf: +top.toFixed(3), bottomQuarter: +bottom.toFixed(3), signedBiasRGB_gpuMinusCurrent: bias }
            try {
                // The source picture drawn by the browser's own 2D canvas (graphics-free area: top-right quarter) says which output is the colour-faithful one.
                const ref = await grabFrame(ctx.source.file, ctx.source.name, shotAt, W, H)
                const quarter = { x: Math.floor(W / 2), y: 0, w: Math.floor(W / 2), h: Math.floor(H / 2) }
                detail.visualDiffVsSource2D = { currentMeanAbsDiff: +meanAbsDiff(a.img, ref, quarter).toFixed(3), webgpuMeanAbsDiff: +meanAbsDiff(b.img, ref, quarter).toFixed(3), region: 'top-right quarter, no graphics' }
            } catch { /* optional */ }
            try {
                const png = async (img: ImageData, name: string): Promise<void> => {
                    const c = new OffscreenCanvas(img.width, img.height)
                    c.getContext('2d')!.putImageData(img, 0, 0)
                    ctx.addArtifact(name, await c.convertToBlob({ type: 'image/png' }))
                }
                const amp = new ImageData(W, H)
                for (let i = 0; i < amp.data.length; i += 4) { for (let k = 0; k < 3; k++) amp.data[i + k] = Math.min(255, Math.abs(a.img.data[i + k] - b.img.data[i + k]) * 16); amp.data[i + 3] = 255 }
                await png(a.img, 'webgpu-current.png'); await png(b.img, 'webgpu-variant.png'); await png(amp, 'webgpu-diff-x16.png')
            } catch { /* pictures are a bonus */ }
            row.note = `${row.note ?? ''}${row.note ? '; ' : ''}picture at ${shotAt.toFixed(1)} s: mean abs diff ${diff.toFixed(2)} / 255`
        }
        rows.push(row)
        // 3. 4K output: no scaling, composite only.
        if (Math.max(ctx.probe.width, ctx.probe.height) >= 3824) rows.push(await pair('4K, captions + score bug (composite only)', NAMES, render(plan.cuts, '4k', graphics, false), render(plan.cuts, '4k', graphics, true)))
    }
    // 4. Micro-benchmark.
    try { rows.push(...(await microbench(ctx, graphics, 120)).rows) } catch (e) { detail.microError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) }
    detail.adapter = probe.info as GpuInfo | null
    return {
        rows, detail,
        notes: [
            'Baseline: Pixel = WebGL for every frame (encoder scaling unusable there); iPad / Mac = the encoder scales plain frames, WebGL scales frames with graphics. The note on each row says which ran. Variant: WebGPU scales and composites every frame that is not already output size.',
            'Detail carries the time breakdown (decode wait / paint and scale / encode call / back-pressure / packet writes), the output frame/gap check for the WebGPU outputs, and the visual diff of one frame with graphics.',
        ],
    }
}
