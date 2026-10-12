// Shared pieces of the /bench experiments: the excerpt plans, a render wrapper, baseline/variant pairing and output checks.
import { EncodedPacketSink, VideoSampleSink } from 'mediabunny'
import { openSource } from '../render/sourceInput'
import { errorInfo } from '../render/diagnostics'
import { discardJob } from '../render/renderJob'
import { clearOldOutputs } from '../render/storage'
import type { Cut, RenderGraphics, RenderOptions, RenderTimeline } from '../render/types'
import { fullMatchExport, highlightsExport, planOutput, type ExportPlan, type ExportState } from '../utils/exportPlans'
import { VIDEO_BITRATE } from '../utils/outputQuality'
import { demoState, render, type BenchSource, type Probe, type Rendering } from './stages'
import { speedupPct, type ExperimentRow } from './results'

export type ExpCtx = {
    source: BenchSource
    probe: Probe
    /** Seconds of the source each experiment works on (the first N seconds). */
    excerptSec: number
    signal: AbortSignal
    onProgress: (fraction: number, text: string) => void
    /** Experiment 4: a file the user picked with the save dialog (desktop Chrome / Edge). */
    saveHandle: FileSystemFileHandle | null
    /** Experiment 3: the visible video element of the page. */
    video: HTMLVideoElement | null
    realDownload: boolean
    /** Offers a file (PNG, MP4) for download on the page. */
    addArtifact: (name: string, blob: Blob) => void
}

export type Measure = { wallMs: number; bytes?: number; detail?: Record<string, unknown>; notes?: string[] }

export const KEEP_DIR = 'exp-keep'
export const CACHE_DIR = 'unit-cache'

/** Length of the excerpt actually used (never longer than the file). */
export const excerptLen = (ctx: ExpCtx, max = Infinity): number => Math.max(5, Math.min(ctx.excerptSec, max, Math.floor(ctx.probe.durationSec)))

export const bitrateFor = (q: '1080p' | '4k'): number => VIDEO_BITRATE[q]

/** A plan state over the first `len` seconds: kick off at 0, two goals (a caption, score bug and a short slow-mo replay each). */
export function excerptState(ctx: ExpCtx, len: number, opts: { replays: boolean; goals?: 1 | 2 } = { replays: true }): ExportState {
    const s = demoState(ctx.source.file, len, ctx.probe.width, ctx.probe.height, true)
    const keep = opts.goals === 1 ? ['k', 'g1', 'w'] : ['k', 'g1', 'g2', 'w']
    return {
        ...s,
        events: s.events.filter((e) => keep.includes(e.id)),
        replayBeforeSec: 3, replayAfterSec: 1,
        fullMatch: { cards: false, captions: true, replays: opts.replays, scoreBug: 'goals', intervalMin: 5, quality: 'original' },
        graphics: { ...s.graphics, cards: false },
    }
}

/** Plain footage, no graphics: the first `len` seconds as one cut. */
export function plainPlan(len: number): { cuts: Cut[]; seconds: number } {
    return { cuts: [{ sourceIndex: 0, startSec: 0, endSec: len }], seconds: len }
}

/** The excerpt as a Full-match style plan with captions, score bug and (optionally) replays. */
export function matchPlan(ctx: ExpCtx, len: number, replays: boolean, goals: 1 | 2 = 2): ExportPlan {
    return fullMatchExport(excerptState(ctx, len, { replays, goals }), 'full')
}

/** The excerpt as a Highlights plan: clips around two goals, replays, captions and tag, title and full-time cards. */
export function highlightsPlan(ctx: ExpCtx, len: number, goals: 1 | 2 = 2, cards = true): ExportPlan {
    const s = excerptState(ctx, len, { replays: true, goals })
    return highlightsExport({ ...s, graphics: { ...s.graphics, cards } }, 'full')
}

export { planOutput }

export type RunOptions = {
    quality?: '1080p' | '4k'
    bitrate?: number
    graphics?: RenderGraphics
    extra?: Partial<RenderOptions>
}

export type RunResult = Measure & { file: File | Blob; rendering: Rendering; timeline: RenderTimeline | null }

/** One render of `cuts` through the real engine, timed from start to the finished file; the output is left for the caller to inspect. */
export async function run(ctx: ExpCtx, cuts: Cut[], o: RunOptions = {}): Promise<RunResult> {
    let timeline: RenderTimeline | null = null
    const t0 = performance.now()
    const stageCtx = { source: ctx.source, includeGraphics: !!o.graphics, forceCanvas: false, signal: ctx.signal, onProgress: ctx.onProgress }
    const rendering = await render(cuts, stageCtx, {
        ...(o.quality ? { output: { quality: o.quality, videoBitrate: o.bitrate ?? bitrateFor(o.quality) } } : {}),
        onTimeline: (t) => { timeline = t },
        ...o.extra,
    }, o.graphics)
    const wallMs = performance.now() - t0
    return { wallMs, bytes: rendering.file.size, file: rendering.file, rendering, timeline, detail: rendering.stats ? { stats: rendering.stats } : {} }
}

/** Deletes the outputs and saved progress a render left in the browser's private storage (and the bench caches). */
export async function cleanOutputs(keepCache = false): Promise<void> {
    await discardJob().catch(() => undefined)
    await clearOldOutputs()
    if (keepCache) return
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(CACHE_DIR, { recursive: true }).catch(() => undefined)
    } catch { /* no storage */ }
}

export async function clearKept(): Promise<void> {
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(KEEP_DIR, { recursive: true }).catch(() => undefined)
    } catch { /* no storage */ }
}

/** Copies a finished output to a folder the output cleaning leaves alone, so the page can offer it for download. */
export async function keepCopy(file: Blob, name: string): Promise<File> {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(KEEP_DIR, { create: true })
    const h = await dir.getFileHandle(name, { create: true })
    const w = await h.createWritable()
    await file.stream().pipeTo(w)
    return h.getFile()
}

/** Runs the baseline and the variant (each cleaned up after) and fills a table row; a failure of either is recorded with its stack. */
export async function pair(label: string, names: [string, string], baseline: () => Promise<Measure>, variant: () => Promise<Measure>, opts: { keepCacheAfterBaseline?: boolean } = {}): Promise<ExperimentRow> {
    const row: ExperimentRow = { label, baselineName: names[0], variantName: names[1] }
    const detail: Record<string, unknown> = {}
    const notes: string[] = []
    for (const [which, fn] of [['baseline', baseline], ['variant', variant]] as const) {
        try {
            const m = await fn()
            if (which === 'baseline') { row.baselineMs = m.wallMs; if (m.bytes !== undefined) row.baselineBytes = m.bytes } else { row.variantMs = m.wallMs; if (m.bytes !== undefined) row.variantBytes = m.bytes }
            if (m.detail) detail[which] = m.detail
            if (m.notes) notes.push(...m.notes.map((n) => `${which}: ${n}`))
        } catch (e) {
            row.error = { ...errorInfo(e), which }
            break
        } finally {
            await cleanOutputs(which === 'baseline' && !!opts.keepCacheAfterBaseline)
        }
    }
    const sp = speedupPct(row.baselineMs, row.variantMs)
    if (sp !== undefined) row.speedupPct = sp
    if (Object.keys(detail).length) row.detail = detail
    if (notes.length) row.note = notes.join('; ')
    return row
}

export type OutputCheck = { ok: boolean; frames: number; frameSec: number; maxGapErrMs: number; firstSec: number; lastEndSec: number; probes: { atSec: number; frames: number }[]; problems: string[] }

/**
 * Opens a finished MP4 and checks it the way a player would see it: presentation times form one continuous frame grid
 * (no gaps, overlaps or restarts at unit joins) and the pictures around each `boundariesSec` really decode.
 */
export async function verifyOutput(file: File | Blob, name: string, boundariesSec: number[]): Promise<OutputCheck> {
    const o = await openSource({ name, file: file instanceof File ? file : new File([file], name) })
    const problems: string[] = []
    try {
        const ts: number[] = []
        for await (const p of new EncodedPacketSink(o.video).packets(undefined, undefined, { metadataOnly: true })) ts.push(p.timestamp)
        ts.sort((a, b) => a - b)
        const gaps = ts.slice(1).map((t, i) => t - ts[i])
        const sorted = [...gaps].sort((a, b) => a - b)
        const frameSec = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
        let maxErr = 0
        for (const g of gaps) maxErr = Math.max(maxErr, Math.abs(g - frameSec))
        if (maxErr > 0.002) problems.push(`frame gaps vary by up to ${(maxErr * 1000).toFixed(1)} ms around ${(frameSec * 1000).toFixed(2)} ms`)
        if (ts.length && ts[0] > frameSec * 1.5) problems.push(`first frame at ${ts[0].toFixed(3)} s`)
        const sink = new VideoSampleSink(o.video)
        const probes: { atSec: number; frames: number }[] = []
        const times = [0.5, ...boundariesSec, Math.max(0.5, o.endSec - 1)]
        for (const t of times) {
            if (t - 0.25 < 0 || t + 0.25 > o.endSec + 0.01) continue
            let n = 0
            for await (const s of sink.samples(t - 0.25, t + 0.25)) { n++; s.close() }
            probes.push({ atSec: +t.toFixed(2), frames: n })
            const want = frameSec > 0 ? 0.5 / frameSec : 0
            if (n < want - 3) problems.push(`only ${n} frames decoded around ${t.toFixed(2)} s (expected ~${want.toFixed(0)})`)
        }
        return { ok: problems.length === 0, frames: ts.length, frameSec, maxGapErrMs: +(maxErr * 1000).toFixed(2), firstSec: ts[0] ?? 0, lastEndSec: o.endSec, probes, problems }
    } finally {
        o.input.dispose()
    }
}

/** A decoded picture of a finished MP4 at `tSec`, drawn into a w x h bitmap's pixels. */
export async function grabFrame(file: File | Blob, name: string, tSec: number, w: number, h: number): Promise<ImageData> {
    const o = await openSource({ name, file: file instanceof File ? file : new File([file], name) })
    try {
        const s = await new VideoSampleSink(o.video).getSample(tSec)
        if (!s) throw new Error(`no picture at ${tSec.toFixed(2)} s`)
        try {
            const c = new OffscreenCanvas(w, h)
            const ctx = c.getContext('2d', { willReadFrequently: true })!
            s.draw(ctx, 0, 0, w, h)
            return ctx.getImageData(0, 0, w, h)
        } finally { s.close() }
    } finally { o.input.dispose() }
}

/** Mean absolute difference per channel over a rectangle of two same-size pictures. */
export function meanAbsDiff(a: ImageData, b: ImageData, rect?: { x: number; y: number; w: number; h: number }): number {
    const r = rect ?? { x: 0, y: 0, w: a.width, h: a.height }
    let sum = 0
    let n = 0
    for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
            const i = (y * a.width + x) * 4
            sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])
            n += 3
        }
    }
    return n ? sum / n : 0
}

/** Fast non-cryptographic 64-bit hash (two FNV-1a runs) of a string, as hex. Enough for a cache key in a prototype. */
export function hash64(s: string): string {
    let h1 = 0x811c9dc5
    let h2 = (0x01000193 ^ 0x9e3779b1) >>> 0
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
        h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0
        h2 = (h2 ^ (h2 >>> 13)) >>> 0
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** Largest number of intervals open at the same time, and total interval time over the span they cover. */
export function overlapOf(spans: { startMs: number; endMs: number }[]): { maxConcurrent: number; overlapFactor: number } {
    if (spans.length === 0) return { maxConcurrent: 0, overlapFactor: 0 }
    const ev = spans.flatMap((s) => [[s.startMs, 1], [s.endMs, -1]] as const).sort((x, y) => x[0] - y[0] || x[1] - y[1])
    let cur = 0
    let max = 0
    for (const [, d] of ev) { cur += d; max = Math.max(max, cur) }
    const total = spans.reduce((a, s) => a + (s.endMs - s.startMs), 0)
    const covered = Math.max(...spans.map((s) => s.endMs)) - Math.min(...spans.map((s) => s.startMs))
    return { maxConcurrent: max, overlapFactor: covered > 0 ? +(total / covered).toFixed(2) : 0 }
}
