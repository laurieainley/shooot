// The benchmark stages. Each runs the app's own render modules (the same renderReel, plans and painters the editor
// uses) on one source file and returns a StageResult; a stage never throws.
import { renderReel } from '../render/mediabunnyEngine'
import { openSource } from '../render/sourceInput'
import { discardJob } from '../render/renderJob'
import { clearOldOutputs } from '../render/storage'
import { errorInfo, type DiagnosticsReport } from '../render/diagnostics'
import { UNKNOWN_SUPPORT, probeSupport, pickH264Encoder, type CodecSupport } from '../render/transcodeSupport'
import type { Cut, RenderGraphics, RenderOptions } from '../render/types'
import { fullMatchExport, highlightsExport, type ExportState } from '../utils/exportPlans'
import { fullMatchCuts } from '../utils/fullMatch'
import { VIDEO_BITRATE } from '../utils/outputQuality'
import { prepareSpec } from '../graphics/prepare'
import type { MatchEvent } from '../types'
import type { StageId, StageResult } from './results'
import { measureDeliver } from './deliver'

export type BenchSource = { name: string; file: File }

export type StageCtx = {
    source: BenchSource
    /** Overrides the default bitrates (bits/s) of the two re-encoding stages. */
    bitrates?: { '4k'?: number; '1080p'?: number }
    includeGraphics: boolean
    forceCanvas: boolean
    /** Time the save step after the stage (default off). */
    deliver?: boolean
    /** ...and really start a download of the output. */
    realDownload?: boolean
    signal: AbortSignal
    onProgress: (fraction: number, text: string) => void
}

export type Probe = { width: number; height: number; durationSec: number; codec: string | null; fps: number | null; audioCodec: string | null; description?: AllowSharedBufferSource }

const heapMB = (): number | null => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return m ? m.usedJSHeapSize / 1048576 : null
}

export async function probeFile(file: File): Promise<Probe> {
    const o = await openSource({ name: file.name, file })
    try {
        let fps: number | null = null
        try { fps = (await o.video.computePacketStats(120)).averagePacketRate } catch { /* unknown */ }
        return {
            width: o.video.displayWidth, height: o.video.displayHeight, durationSec: o.endSec, codec: o.config.codec, fps,
            audioCodec: o.audio?.codec ?? null, ...(o.config.description ? { description: o.config.description } : {}),
        }
    } finally {
        o.input.dispose()
    }
}

/** A plan state with a kick-off, three goals spread across the clip and a final whistle. */
export function demoState(file: File, durationSec: number, width: number, height: number, withGraphics: boolean): ExportState {
    const at = (f: number): number => Math.round(durationSec * f * 10) / 10
    const ev = (id: string, type: MatchEvent['type'], t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, type, matchTimeSec: t, sourceFileIndex: 0, ...extra })
    return {
        files: [{ id: 'bench', file, url: '', name: file.name, durationSec, width, height, kind: 'full' }],
        events: [
            ev('k', 'kick_off', 0),
            ev('g1', 'goal', at(0.25), { team: 'Whites', scorer: 'A. Striker', assist: 'B. Winger' }),
            ev('g2', 'goal', at(0.55), { team: 'Colours', scorer: 'C. Forward' }),
            ev('g3', 'goal', at(0.8), { team: 'Whites', scorer: 'A. Striker' }),
            ev('w', 'final_whistle', Math.max(1, durationSec - 0.5)),
        ],
        cumulativeOffsets: [0],
        lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
        graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot' },
        teams: [{ name: 'Whites', color: '#f2f2f2', roster: [] }, { name: 'Colours', color: '#2b6cff', roster: [] }],
        matchdayLabel: 'BENCH',
        fullMatch: withGraphics
            ? { cards: true, captions: true, replays: true, scoreBug: 'goals', intervalMin: 5, quality: 'original' }
            : { cards: false, captions: false, replays: false, scoreBug: 'off', intervalMin: 5, quality: 'original' },
    }
}

export type Rendering = { file: File | Blob; diagnostics: DiagnosticsReport | null; stats: Record<string, unknown> | null }

export async function render(cuts: Cut[], ctx: StageCtx, extra: Partial<RenderOptions>, graphics?: RenderGraphics): Promise<Rendering> {
    let diagnostics: DiagnosticsReport | null = null
    let stats: Record<string, unknown> | null = null
    const signature = `bench-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await discardJob('fullMatch')
    try {
        const file = await renderReel(cuts, [ctx.source], {
            onProgress: (p) => ctx.onProgress(p.fraction, p.stage ?? ''),
            signal: ctx.signal,
            kind: 'fullMatch',
            outputName: 'bench-output.mp4',
            resumable: { signature, kind: 'fullMatch' },
            onDiagnostics: (d) => { diagnostics = d },
            onStats: (s) => { stats = { ...s } },
            ...(graphics ? { graphics } : {}),
            ...extra,
        })
        return { file, diagnostics, stats }
    } finally {
        await discardJob('fullMatch')
    }
}

const encoderInfo = (d: DiagnosticsReport | null): Record<string, unknown> | undefined => {
    if (!d) return undefined
    const cfg = d.finalEncoderConfig as { codec?: string; hardwareAcceleration?: string; bitrate?: number; width?: number; height?: number } | null
    return {
        codec: cfg?.codec, hardwareAcceleration: cfg?.hardwareAcceleration, bitrate: cfg?.bitrate, size: cfg ? `${cfg.width}x${cfg.height}` : undefined,
        timingsMs: d.timingsMs, scalePath: d.notes.find((n) => n.startsWith('Scale path:')), graphicsSkipped: d.graphics.skipped.map((s) => `${s.label}: ${s.reason}`),
        notes: d.notes,
    }
}

/** Runs `body` as a stage: timing, heap peak, error capture. `mediaSeconds` is what the realtime multiple is measured against. */
async function stage(id: StageId, label: string, ctx: StageCtx, mediaSeconds: number, fps: number | null, body: (sampleHeap: () => void) => Promise<{ outputBytes?: number; encoder?: Record<string, unknown>; detail?: Record<string, unknown>; notes?: string[]; deliverFile?: Blob }>): Promise<StageResult> {
    const base = { stage: id, label, source: ctx.source.name }
    let peak: number | null = heapMB()
    const sample = (): void => { const h = heapMB(); if (h !== null && (peak === null || h > peak)) peak = h }
    const t0 = performance.now()
    try {
        const r = await body(sample)
        sample()
        const wallMs = performance.now() - t0
        // After the clock stopped: the save step must not change the stage's own numbers.
        let deliver: StageResult['deliver']
        let deliverError: string | undefined
        if (ctx.deliver && r.deliverFile) {
            try { deliver = await measureDeliver(r.deliverFile, `bench-${id}.mp4`, !!ctx.realDownload) } catch (e) { deliverError = errorInfo(e).message /* the stage itself succeeded */ }
        }
        return {
            ...base, status: 'ok', wallMs, mediaSeconds, timesRealtime: wallMs / 1000 / mediaSeconds,
            ...(fps ? { fps: (mediaSeconds * fps) / (wallMs / 1000) } : {}), peakHeapMB: peak,
            ...(r.outputBytes !== undefined ? { outputBytes: r.outputBytes } : {}), ...(r.encoder ? { encoder: r.encoder } : {}),
            ...(r.detail ? { detail: r.detail } : {}), ...(r.notes ? { notes: r.notes } : {}), ...(deliver ? { deliver } : {}), ...(deliverError ? { deliverError } : {}),
        }
    } catch (e) {
        return { ...base, status: 'failed', wallMs: performance.now() - t0, peakHeapMB: peak, error: errorInfo(e) }
    }
}

const skipped = (id: StageId, label: string, ctx: StageCtx, reason: string): StageResult => ({ stage: id, label, source: ctx.source.name, status: 'skipped', reason })

export type StageDef = { id: StageId; label: string; hint: string; run: (ctx: StageCtx, probe: Probe) => Promise<StageResult> }

export async function probeCodecSupport(p: Probe): Promise<CodecSupport> {
    return p.codec ? probeSupport({ codec: p.codec, ...(p.description ? { description: p.description } : {}), width: p.width, height: p.height }) : UNKNOWN_SUPPORT
}

function encodeStage(id: 'reencode1080' | 'reencode4k', quality: '1080p' | '4k'): StageDef['run'] {
    return async (ctx, p) => {
        const label = quality === '4k' ? 'Re-encode to 4K' : 'Re-encode to 1080p'
        const long = Math.max(p.width, p.height)
        if (quality === '4k' && long < 3824) return skipped(id, label, ctx, `source is ${p.width}x${p.height}, not 4K`)
        const support = await probeCodecSupport(p)
        if (support.decode === false) return skipped(id, label, ctx, `this browser cannot decode ${p.codec}`)
        if (support.encode[quality] === false) return skipped(id, label, ctx, `this browser cannot encode ${quality} H.264`)
        const bitrate = ctx.bitrates?.[quality] ?? VIDEO_BITRATE[quality]
        const state = demoState(ctx.source.file, p.durationSec, p.width, p.height, ctx.includeGraphics)
        const plan = fullMatchExport(state, 'full')
        const graphics = ctx.includeGraphics ? await prepareSpec(plan.spec) : undefined
        const outSeconds = plan.seconds
        return stage(id, `${label} (${(bitrate / 1e6).toFixed(0)} Mbps${ctx.includeGraphics ? ', with graphics' : ', no graphics'})`, ctx, outSeconds, p.fps, async (sample) => {
            const r = await render(plan.cuts, { ...ctx, onProgress: (f, t) => { sample(); ctx.onProgress(f, t) } }, { output: { quality, videoBitrate: bitrate, forceCanvas: ctx.forceCanvas } }, graphics)
            return { outputBytes: r.file.size, encoder: encoderInfo(r.diagnostics), deliverFile: r.file, detail: { outputSeconds: outSeconds, graphicsApplied: r.diagnostics?.graphics.applied, ...(r.stats ? { pipeline: r.stats } : {}) } }
        })
    }
}

export const STAGES: StageDef[] = [
    {
        id: 'probe', label: 'Probe / demux', hint: 'Open the file, read its tracks and last packet.',
        run: async (ctx, p) => stage('probe', 'Probe / demux', ctx, p.durationSec, null, async () => {
            const o = await openSource({ name: ctx.source.name, file: ctx.source.file })
            try { return { detail: { ...p, description: undefined, videoCodec: o.video.codec } } } finally { o.input.dispose() }
        }),
    },
    {
        id: 'copy', label: 'Stream copy (Original)', hint: 'The whole clip copied, as the Full match "Original" export.',
        run: async (ctx, p) => {
            const cuts = fullMatchCuts([p.durationSec], 0, null)
            return stage('copy', 'Stream copy (Original)', ctx, p.durationSec, p.fps, async (sample) => {
                const r = await render(cuts, { ...ctx, onProgress: (f, t) => { sample(); ctx.onProgress(f, t) } }, {})
                return { outputBytes: r.file.size, encoder: encoderInfo(r.diagnostics), deliverFile: r.file }
            })
        },
    },
    {
        id: 'highlights', label: 'Highlights-style render', hint: 'A few clips, a slow-mo replay, a caption and score bug, title and full-time cards.',
        run: async (ctx, p) => {
            const state = demoState(ctx.source.file, p.durationSec, p.width, p.height, true)
            const plan = highlightsExport(state, 'full')
            const graphics = await prepareSpec(plan.spec)
            return stage('highlights', 'Highlights-style render', ctx, plan.seconds, p.fps, async (sample) => {
                const r = await render(plan.cuts, { ...ctx, onProgress: (f, t) => { sample(); ctx.onProgress(f, t) } }, {}, graphics)
                return { outputBytes: r.file.size, encoder: encoderInfo(r.diagnostics), deliverFile: r.file, detail: { clips: plan.cuts.length, graphicsApplied: r.diagnostics?.graphics.applied, ...(r.stats ? { overlaySpans: r.stats } : {}) } }
            })
        },
    },
    { id: 'reencode1080', label: 'Re-encode to 1080p', hint: 'Whole clip to 1080p H.264 at the default bitrate.', run: encodeStage('reencode1080', '1080p') },
    { id: 'reencode4k', label: 'Re-encode to 4K', hint: 'Whole clip to 4K H.264 at the default bitrate (skipped below 4K).', run: encodeStage('reencode4k', '4k') },
    {
        id: 'graphics', label: 'Graphics only', hint: 'Paint 300 frames of the title card and the caption/score bug, no video.',
        run: async (ctx, p) => {
            const state = demoState(ctx.source.file, p.durationSec, p.width, p.height, true)
            const plan = fullMatchExport(state, 'full')
            const graphics = await prepareSpec(plan.spec)
            return stage('graphics', 'Graphics only', ctx, 10, 30, async (sample) => {
                if (!graphics) throw new Error('the plan has no graphics')
                const detail: Record<string, unknown> = {}
                for (const [name, w, h] of [['1080p', 1920, 1080], ['4K', 3840, 2160]] as const) {
                    const canvas = new OffscreenCanvas(w, h)
                    const c = canvas.getContext('2d')!
                    const N = 300
                    const t0 = performance.now()
                    for (let i = 0; i < N; i++) {
                        c.clearRect(0, 0, w, h)
                        graphics.intro?.paint(c, (i / 30) % (graphics.intro.durationSec || 1))
                        for (const o of graphics.overlays.slice(0, 4)) { c.save(); o.paint(c, (i / 30) % Math.max(0.5, o.durationSec)); c.restore() }
                        c.getImageData(0, 0, 1, 1) // forces the canvas to finish drawing, so the time is the real cost
                        if (i % 50 === 0) { sample(); ctx.onProgress(i / N, name); await new Promise((r) => setTimeout(r, 0)) }
                    }
                    const ms = performance.now() - t0
                    detail[name] = { frames: N, msPerFrame: +(ms / N).toFixed(2), overlays: Math.min(4, graphics.overlays.length) }
                }
                return { detail }
            })
        },
    },
]

/** Deletes everything the stages left in the browser's private storage. */
export async function cleanUp(): Promise<void> {
    await discardJob('fullMatch').catch(() => undefined)
    await clearOldOutputs()
}

export async function encodeSupportMatrix(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    const dec = async (name: string, codec: string, w: number, h: number): Promise<void> => {
        out[name] = typeof VideoDecoder === 'undefined' ? 'no VideoDecoder'
            : await VideoDecoder.isConfigSupported({ codec, codedWidth: w, codedHeight: h }).then((r) => !!r.supported, (e: unknown) => `error: ${errorInfo(e).message}`)
    }
    await dec('decode HEVC 1080p', 'hvc1.1.6.L120.B0', 1920, 1080)
    await dec('decode HEVC 4K', 'hvc1.1.6.L153.B0', 3840, 2160)
    await dec('decode H.264 1080p', 'avc1.640028', 1920, 1080)
    await dec('decode H.264 4K', 'avc1.640033', 3840, 2160)
    for (const [name, w, h, fps] of [['1080p', 1920, 1080, 30], ['4K', 3840, 2160, 30]] as const) {
        for (const hw of ['prefer-hardware', 'prefer-software'] as const) {
            const e = await pickH264Encoder(w, h, 10e6, fps, [hw])
            out[`encode H.264 ${name} ${hw}`] = !!e
        }
    }
    out['audio encoder (AAC)'] = typeof AudioEncoder === 'undefined' ? false : await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 }).then((r) => !!r.supported, () => false)
    return out
}
