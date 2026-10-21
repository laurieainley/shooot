// The re-encoding render (Full match "4K" / "1080p"): every frame is decoded, drawn onto a canvas of the output size
// (scaled, replay crop, cards, captions, score bug) and encoded to H.264 on the spot, so graphics cost no extra pass.
// The output is a constant frame rate with a key frame every ~2 s. Audio is copied when it is AAC, else encoded to AAC.
//
// Resumable like the stream-copy engine: the render is a list of units (title card, segments of at most
// SEGMENT_SEC of output, full-time card); each finished unit is a packet log in OPFS and the job is saved in IndexedDB.
// Every unit starts with a key frame from its own encoder, so units join anywhere. An interrupted render loses at
// most the unit in progress (about two minutes of output).
import { emptyStats } from './experiments'
import { EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, VideoSampleSink, type VideoSample } from 'mediabunny'
import { RenderDiagnostics, errorInfo } from './diagnostics'
import type { LogRecord } from './packetLog'
import { RENDER_VERSION, decodeDescription, digest, encodeDescription, evictForRoom, opfsUnitStore } from './unitCache'
import { clipPartSeconds, replayPartAfter } from './captionJoin'
import { planAudio } from './audioPlan'
import { nominalFrameRate } from './frameGrid'
import { muxUnits } from './muxUnits'
import { coverRect } from './outputSize'
import { type JobKind, canJournal, claimJournal, ownsJournal, discardJob, loadJob, openUnit, readUnit, saveJob, type JobState, type UnitWriter } from './renderJob'
import { GlScaler, isDownscale, probeDirectScale } from './downscale'
import { GpuPath } from './gpuScaler'
import { encodeReplayAudio } from './replayAudio'
import { makeSilentAudio, type SilentAudio } from './silentAudio'
import { makeTarget, openSource, type OpenSource } from './sourceInput'
import { MIN_PARALLEL_UNIT_SEC, PARALLEL_UNITS, aacConfig, cutFrames, keyEvery, outputDimensions, outputFrameSec, planSegments, sourceTimeOf, type Segment } from './transcodePlan'
import { runPool } from './unitPool'
import { OrderedSink } from './orderedSink'
import { pickH264Encoder, type H264Encoder } from './transcodeSupport'
import type { Cut, CutTiming, GraphicsReport, RenderCard, RenderGraphics, RenderOptions, RenderOverlay, RenderSource } from './types'
import { waitForQueue } from './yield'
import { abortable, anyAbort, cancelledError } from './abortable'
import { DEFAULT_COEF, WorkMeter, detectDeviceClass, factsOfSource, parallelFactor, planWork, priceUnits, ZERO_UNITS } from '../utils/renderTime'
import { cutTiming } from '../utils/chapterTimes'
import { AUDIO_BITRATE } from '../utils/outputQuality'

/** Longest stretch of output one unit covers (progress is saved after each). */
export const SEGMENT_SEC = 120
const OUTPUT_NAME = 'highlights.mp4'
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

/** What one unit draws on: normally the engine's single canvas and WebGL scaler; parallel units each get their own. `work`: model seconds this unit has credited so far. */
type UnitEnv = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D; gl: GlScaler | null; writer: UnitWriter | null; cancelled: boolean; /** Aborts when the pool gives up on this unit (a sibling failed): everything the unit awaits stops at once. */ stop: AbortController; work: number; /** Labels of the graphics this unit drew (kept with a cached unit). */ labels: Set<string> }

type Unit = { kind: 'intro' } | { kind: 'outro' } | { kind: 'segment'; segment: Segment }

/** Frame bookkeeping for the diagnostics: every VideoFrame the engine made must be closed again. */
class FrameCount {
    made = 0
    closed = 0
    make(f: VideoFrame): VideoFrame { this.made++; return f }
    close(f: VideoFrame): void { f.close(); this.closed++ }
}

export async function renderTranscoded(cuts: Cut[], sources: RenderSource[], opts: RenderOptions, diag: RenderDiagnostics): Promise<File | Blob> {
    const out = opts.output!
    const jobKind: JobKind = opts.resumable?.kind ?? 'fullMatch'
    const exp = opts.experiments
    const stats = emptyStats()
    const perfStart = performance.now()
    const now = (): number => performance.now()
    const { onProgress, signal } = opts
    const outputName = opts.outputName ?? OUTPUT_NAME
    if (cuts.length === 0) throw new Error('Nothing to render')
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('this browser cannot encode video')
    const g: RenderGraphics | undefined = opts.graphics
    const report: GraphicsReport = { applied: [], skipped: [] }
    const skip = (label: string, reason: string, error?: unknown): void => {
        if (!label || report.skipped.some((s) => s.label === label)) return
        report.skipped.push({ label, reason })
        diag.graphicSkipped(label, reason, error)
    }
    const frames = new FrameCount()
    let gl0: GlScaler | null = null
    let gpu0: GpuPath | null = null
    const used = new Set(cuts.map((c) => c.sourceIndex))
    const opened: OpenSource[] = []
    try {
        const endOpen = diag.begin('openSources')
        for (const [i, s] of sources.entries()) if (used.has(i)) opened[i] = await openSource(s)
        endOpen()
        const first = opened[cuts[0].sourceIndex]
        for (const i of used) {
            if (!(await opened[i].video.canDecode())) throw new Error(`${sources[i].name}: this browser cannot decode its ${opened[i].video.codec ?? 'video'}`)
        }

        // Output size and the constant frame rate.
        const { width: W, height: H } = outputDimensions(out.quality, first.video.displayWidth, first.video.displayHeight)
        const sample: number[] = []
        for await (const p of new EncodedPacketSink(first.video).packets(undefined, undefined, { metadataOnly: true })) {
            sample.push(p.timestamp)
            if (sample.length >= 120) break
        }
        const nominal = nominalFrameRate(sample)
        const frameSec = outputFrameSec(nominal)
        const fps = 1 / frameSec
        const keyFrames = keyEvery(frameSec, 2)
        diag.outputSize(W, H)
        diag.note(`Re-encode ${out.quality}: ${W}x${H} at ${fps.toFixed(3)} fps (source ~${nominal.toFixed(2)} fps), ${(out.videoBitrate / 1e6).toFixed(1)} Mbps, key frame every ${keyFrames} frames`)
        /** Experiment 7: the encoder's latency mode (the default config says 'quality'). */
        const tuned = async (e: H264Encoder | null): Promise<H264Encoder | null> => {
            if (!e || !exp?.latencyMode || e.config.latencyMode === exp.latencyMode) return e
            const config = { ...e.config, latencyMode: exp.latencyMode }
            const r = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }))
            if (!r.supported) throw new Error(`this browser's encoder does not support latencyMode '${exp.latencyMode}'`)
            return { ...e, config }
        }
        let encoder: H264Encoder | null = await tuned(await pickH264Encoder(W, H, out.videoBitrate, fps))
        if (!encoder) throw new Error(`this browser cannot encode H.264 at ${W}×${H}`)
        diag.finalEncoder(encoder.config)
        diag.note(`Video encoder: ${encoder.config.codec}, hardwareAcceleration ${encoder.hardware}, latencyMode ${encoder.config.latencyMode}`)

        // Scaling a 4K frame down: the 2D canvas is very slow in WebKit, so prefer the encoder (frames without graphics) and WebGL (with).
        const srcW = first.video.displayWidth
        const srcH = first.video.displayHeight
        const shrinks = !out.forceCanvas && isDownscale(srcW, srcH, W, H)
        let directScale = false
        const scaled = { direct: 0, webgl: 0, canvas: 0 }
        if (out.forceCanvas) diag.note('Scale path: 2D canvas only (forced)')
        else if (!shrinks) diag.note(`Scale path: 2D canvas (source ${srcW}x${srcH} is not a larger copy of ${W}x${H})`)
        else {
            const p = await probeDirectScale(encoder.config, srcW, srcH)
            directScale = p.ok
            gl0 = GlScaler.create(W, H)
            diag.note(`Scale path: ${p.ok ? 'encoder scales plain frames' : `${gl0 ? 'WebGL' : '2D canvas'} for plain frames (encoder scaling unusable: ${p.reason})`}; ${gl0 ? 'WebGL for frames with graphics' : '2D canvas for frames with graphics (no WebGL2)'}`)
        }

        // #11 (bench): WebGPU scales every frame that is not already the output size, and composites graphics in the same pass.
        const gpuPath = exp?.scaler === 'webgpu' ? gpu0 = await GpuPath.open(W, H, (t) => diag.note(t)) : null
        if (gpuPath) directScale = false

        // Which cuts exist (a cut outside its file is dropped), and where graphics attach.
        const valid: { ci: number; cut: Cut }[] = []
        cuts.forEach((c, ci) => {
            const src = opened[c.sourceIndex]
            const endSec = Math.min(c.endSec, src.endSec)
            if (c.startSec >= src.endSec || endSec <= c.startSec) return
            valid.push({ ci, cut: { ...c, endSec } })
        })
        if (valid.length === 0) throw new Error('Nothing to render: every cut is outside its file')
        const planCuts = valid.map((v) => v.cut)
        // Units run PARALLEL_UNITS at a time when the render is journaled (the bench can force 1, 2 or 3); the plan then makes sure there are enough of them.
        const journaled = opts.resumable ? await canJournal(jobKind) : false
        // "Save to file…" has no journal but runs units in parallel too: the unit in line streams into the file, the others buffer in memory (see orderedSink).
        const parallelN = journaled || exp?.targetFile ? Math.max(1, Math.floor(exp?.parallelUnits ?? PARALLEL_UNITS)) : 1
        // Units of the last export of this kind that no edit touched are reused (journaled re-encodes only); their boundaries must then not shift with the edit.
        const reuse = journaled && exp?.unitCache !== false ? opts.reuse : undefined
        if (!journaled && !exp?.targetFile && (exp?.parallelUnits ?? 1) > 1) diag.note('Parallel units need a resumable (journaled) render or a file to save into: running one unit at a time')
        const segments = planSegments(planCuts, frameSec, Math.round((exp?.segmentSec ?? SEGMENT_SEC) / frameSec), parallelN > 1 ? { units: parallelN, minFrames: Math.round(MIN_PARALLEL_UNIT_SEC / frameSec), ...(reuse ? { stable: true } : {}) } : undefined)
        const units: Unit[] = [{ kind: 'intro' }, ...segments.map((segment): Unit => ({ kind: 'segment', segment })), { kind: 'outro' }]
        const cardFrames = (c: RenderCard | undefined): number => (c ? Math.max(1, Math.round(c.durationSec / frameSec)) : 0)

        const overlaysByCut = new Map<number, RenderOverlay[]>()
        for (const o of g?.overlays ?? []) {
            if (!cuts[o.cutIndex]) { skip(o.label, 'its clip is not in the reel'); continue }
            overlaysByCut.set(o.cutIndex, [...(overlaysByCut.get(o.cutIndex) ?? []), o])
        }
        // Overlays tied to the cut follow its exact extent here (cuts are not snapped to key frames).
        const endOfCut = (ci: number): number => planCuts[valid.findIndex((v) => v.ci === ci)]?.endSec ?? cuts[ci].endSec
        const resolved = new Map<number, RenderOverlay[]>()
        for (const v of valid) {
            const planned = overlaysByCut.get(v.ci)
            if (!planned) continue
            const cutStart = v.cut.startSec
            const length = Math.max(1e-3, v.cut.endSec - cutStart)
            const list: RenderOverlay[] = []
            for (const o of planned) {
                if (o.anchor === 'fromCutStart') {
                    const prev = o.follows ? overlaysByCut.get(v.ci - 1)?.find((x) => x.anchor === 'toCutEnd' && x.label === o.label) : undefined
                    if (o.follows && prev) {
                        const shown = clipPartSeconds(prev.startSec, prev.durationSec, endOfCut(v.ci - 1), o.follows.totalSec)
                        const after = replayPartAfter({ shownSec: shown, plannedOffsetSec: o.follows.offsetSec, totalSec: o.follows.totalSec, rate: o.follows.rate, replaySec: length })
                        if (after) list.push({ ...o, startSec: cutStart, durationSec: after.durationSec, paint: (ctx, t) => o.paint(ctx, t + after.paintShiftSec) })
                        continue
                    }
                    list.push({ ...o, startSec: cutStart })
                } else if (o.anchor === 'toCutEnd') {
                    list.push({ ...o, durationSec: clipPartSeconds(o.startSec, o.durationSec, v.cut.endSec, o.follows?.totalSec ?? 5) })
                } else if (o.anchor === 'wholeCut') {
                    const shift = cutStart - o.startSec
                    list.push({ ...o, startSec: cutStart, durationSec: length + 1, paint: (ctx, t) => o.paint(ctx, t + shift) })
                } else if (o.anchor === 'stretchToCut') {
                    const k = o.durationSec / length
                    list.push({ ...o, startSec: cutStart, durationSec: length + 1, paint: (ctx, t) => o.paint(ctx, Math.min(o.durationSec, t * k)) })
                } else list.push(o)
            }
            resolved.set(v.ci, list)
        }
        // Progress is the share of estimated WORK done, not frames: frames drawn on the canvas (cards, replay crops, graphics) cost more
        // than plain ones (utils/renderTime prices every cut and card with the same model the Export panel's hint uses).
        const pricing = { facts: factsOfSource({ width: srcW, height: srcH, codec: first.video.codec, fps: nominal, bytes: sources[cuts[0].sourceIndex].file.size, seconds: first.endSec }), output: out.quality, coef: DEFAULT_COEF[detectDeviceClass()] }
        const work = planWork({
            cuts: planCuts,
            overlays: valid.flatMap((v, vi) => (resolved.get(v.ci) ?? []).map((o) => ({ cutIndex: vi, startSec: o.startSec, durationSec: o.durationSec, ...(o.anchor === 'wholeCut' || o.anchor === 'stretchToCut' ? { whole: true } : {}) }))),
            introSec: g?.intro ? cardFrames(g.intro) * frameSec : 0, outroSec: g?.outro ? cardFrames(g.outro) * frameSec : 0,
        }, pricing)
        const fullWork = work.seconds || 1
        // Parts reused from the last export cost nothing: the work, the progress and the estimate below are for what is really rendered.
        let totalWork = fullWork
        let meter = new WorkMeter(totalWork)
        // Replay crops are done with the picture itself; only a failure to draw can lose them.
        for (const c of cuts) if (c.crop) diag.graphicApplied(c.cropLabel ?? 'Replay zoom')

        // Audio: one track. AAC in every file is copied; anything else is encoded to AAC at AUDIO_BITRATE.
        const usedList = [...used]
        const audioPlanned = planAudio(usedList.map((i) => opened[i].audio))
        if (!audioPlanned.ok) throw new Error('Clips use different audio formats and cannot be joined without re-encoding')
        const refAudio = audioPlanned.reference === null ? null : opened[usedList[audioPlanned.reference]].audio
        const hasAudio = !!refAudio?.codec
        const copyAac = hasAudio && usedList.every((i) => !opened[i].audio || opened[i].audio!.codec === 'aac')
        let aConfig: AudioDecoderConfig | null = null
        if (hasAudio && refAudio) {
            aConfig = copyAac
                ? (await refAudio.getDecoderConfig())!
                : { codec: 'mp4a.40.2', sampleRate: refAudio.sampleRate, numberOfChannels: refAudio.numberOfChannels, description: aacConfig(refAudio.sampleRate, refAudio.numberOfChannels) }
            if (!copyAac) diag.note(`Audio is ${refAudio.codec}: encoded to AAC at ${AUDIO_BITRATE / 1000} kbps`)
        }
        let silence: SilentAudio | null | undefined
        const silencePackets = async (durationSec: number): Promise<EncodedPacket[] | null> => {
            if (silence === undefined) silence = refAudio ? await makeSilentAudio({ sampleRate: refAudio.sampleRate, numberOfChannels: refAudio.numberOfChannels }).catch(() => null) : null
            return silence ? silence.packets(durationSec) : null
        }

        // ---- unit cache: which parts of the last export can be reused ----
        const store = reuse ? opfsUnitStore() : null
        let cacheOn = !!store
        let cached = new Set<string>()
        let reusedActual = 0
        let reusedPlanned = 0
        let keyedUnits = 0
        const usedKeys = new Map<number, string>() // unit -> key, for the units that came from or went to the cache
        const unitFrames = (u: number): number => { const x = units[u]; return x.kind === 'intro' ? (g?.intro ? cardFrames(g.intro) : 0) : x.kind === 'outro' ? (g?.outro ? cardFrames(g.outro) : 0) : x.segment.frames }
        /** Everything the engine decides about a unit's packets: size, rate, bitrate, key frames, the encoder in use, the scale path and the audio. */
        const unitFacts = (): unknown => ({
            v: RENDER_VERSION, W, H, frameSec, quality: out.quality, bitrate: out.videoBitrate, keyFrames, encoder: { hw: encoder!.hardware, config: encoder!.config },
            scale: { direct: directScale, gl: !!gl0, canvas: !!out.forceCanvas }, audio: hasAudio ? { copyAac, codec: refAudio?.codec ?? null, rate: aConfig?.sampleRate ?? null, channels: aConfig?.numberOfChannels ?? null } : null,
        })
        /** The key of unit `u` as it would be encoded now; null for a unit that is not cached (no card, or no reuse). */
        const unitKeyOf = async (u: number): Promise<string | null> => {
            if (!reuse) return null
            const unit = units[u]
            let part: unknown
            if (unit.kind === 'intro') part = g?.intro && reuse.intro ? { spec: reuse.intro, label: g.intro.label, sec: g.intro.durationSec } : null
            else if (unit.kind === 'outro') part = g?.outro && reuse.outro ? { spec: reuse.outro, label: g.outro.label, sec: g.outro.durationSec } : null
            else {
                const sg = unit.segment
                const v = valid[sg.cutIndex]
                const a = sourceTimeOf(v.cut, sg.firstFrame, frameSec)
                const b = sourceTimeOf(v.cut, sg.firstFrame + sg.frames, frameSec)
                // What the prepared graphics will really draw here must agree with the plan the key was made from (a failed font or logo leaves graphics out).
                const drawn = (g?.overlays ?? []).filter((o) => o.cutIndex === v.ci && (o.anchor !== undefined || (o.startSec < b + 1e-3 && o.startSec + o.durationSec > a - 1e-3))).map((o) => [o.label, o.anchor ?? null, o.startSec, o.durationSec, o.follows ?? null])
                part = { spec: reuse.cut(v.ci, a, b), drawn, first: sg.firstFrame }
            }
            if (part === null) return null
            return digest({ facts: unitFacts(), kind: unit.kind, frames: unitFrames(u), part })
        }
        const unitWork = (u: number): number => {
            const x = units[u]
            if (x.kind === 'intro') return work.sections[0].seconds
            if (x.kind === 'outro') return work.sections[work.sections.length - 1].seconds
            return work.sections[x.segment.cutIndex + 1].seconds * x.segment.frames / cutFrames(valid[x.segment.cutIndex].cut, frameSec)
        }
        let reusedWork = 0
        if (reuse && store) {
            try {
                const total = units.reduce((a, _, u) => a + unitFrames(u), 0)
                const keys = await Promise.all(units.map((_, u) => unitKeyOf(u)))
                keyedUnits = keys.filter((k) => k !== null).length
                cached = await store.keys()
                // Room first: the render itself needs about twice its output (unit logs plus the file); cached units are reclaimable, the ones about to be reused last.
                const freed = await evictForRoom(total * frameSec * out.videoBitrate / 8 * 2.2, new Set(keys.filter((k): k is string => !!k && cached.has(k))))
                if (freed > 0) { cached = await store.keys(); diag.note(`Cleared ${(freed / 1e6).toFixed(0)} MB of saved parts from earlier exports to make room`) }
                keys.forEach((k, u) => { if (k && cached.has(k)) reusedWork += unitWork(u) })
                const n = keys.filter((k) => k && cached.has(k)).length
                if (n > 0) diag.note(`Unit cache: ${n} of ${keyedUnits} parts can be reused from the last export`)
                totalWork = Math.max(1e-3, fullWork - reusedWork)
                meter = new WorkMeter(totalWork)
                reusedPlanned = n
            } catch (e) { cacheOn = false; diag.note(`Unit cache unavailable: ${errorText(e)}`) }
        }
        // The estimate is for the render as it will run: units in parallel finish sooner (the same factor the Export panel's hint uses), reused parts are free.
        onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: 0, stage: 'Starting', estimateSec: totalWork * (parallelN > 1 ? parallelFactor(detectDeviceClass(), out.quality, parallelN) : 1), ...(reusedPlanned > 0 ? { reused: { units: reusedPlanned, of: keyedUnits } } : {}) })

        // Journal (resumable) or direct output.
        let journal: { state: JobState } | null = null
        let startUnit = 0
        let timings: (CutTiming | null)[] = cuts.map(() => null)
        let timingsKnown = true
        let vConfig: VideoDecoderConfig | null = null
        let cursorFrames = 0
        let done = 0
        let copied = false
        let claim = 0
        if (journaled) {
            claim = claimJournal(jobKind)
            const prev = await loadJob(jobKind)
            const same = prev && prev.signature === opts.resumable!.signature && prev.graphics === !!g && prev.unitCount === units.length
            if (same && prev.unitsDone > 0 && prev.video) {
                journal = { state: prev }
                startUnit = prev.unitsDone
                vConfig = prev.video
                cursorFrames = Math.round(prev.cursor / frameSec)
                done = (prev.done / (prev.total || 1)) * totalWork // saved as a share of the work, whatever the units
                copied = prev.copied
                if (prev.timings?.length === cuts.length) timings = prev.timings
                else timingsKnown = false
                if (prev.report) {
                    report.applied.push(...prev.report.applied); report.skipped.push(...prev.report.skipped)
                    for (const l of prev.report.applied) diag.graphicApplied(l)
                    for (const s of prev.report.skipped) diag.graphicSkipped(s.label, s.reason)
                }
                diag.note(`Resumed after unit ${startUnit} of ${units.length}`)
            } else {
                await discardJob(jobKind)
                const state: JobState = {
                    kind: opts.resumable!.kind, signature: opts.resumable!.signature, outputName, graphics: !!g,
                    unitsDone: 0, unitCount: units.length, cursor: 0, done: 0, total: totalWork, copied: false, report: null,
                    video: null, audio: aConfig, updatedAt: Date.now(),
                }
                await saveJob(state)
                journal = { state }
            }
        }
        let direct: { output: Output; vOut: EncodedVideoPacketSource; aOut: EncodedAudioPacketSource | null; result: () => Promise<File | Blob>; discard: () => Promise<void> } | null = null
        if (!journal) {
            if (exp?.targetFile) diag.note(`Output: written straight to a file the user picked (no browser storage)${parallelN > 1 ? `; up to ${parallelN} units at once, those ahead buffered in memory` : ''}`)
            const { target, result, discard } = await makeTarget(outputName, exp?.targetFile)
            const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
            const vOut = new EncodedVideoPacketSource('avc')
            output.addVideoTrack(vOut)
            const aOut = hasAudio ? new EncodedAudioPacketSource('aac') : null
            if (aOut) output.addAudioTrack(aOut)
            await output.start()
            direct = { output, vOut, aOut, result, discard }
        }
        let vFirst = true
        let aFirst = true
        const emitVideo = async (env: UnitEnv, p: EncodedPacket): Promise<void> => {
            if (env.writer) await abortable(env.writer.write({ track: 0, key: p.type === 'key', timestamp: p.timestamp, duration: p.duration, data: p.data }), signal)
            else { await abortable(direct!.vOut.add(p, vFirst ? { decoderConfig: vConfig! } : undefined), signal); vFirst = false }
        }
        const emitAudio = async (env: UnitEnv, p: EncodedPacket): Promise<void> => {
            if (env.writer) await abortable(env.writer.write({ track: 1, key: true, timestamp: p.timestamp, duration: p.duration, data: p.data }), signal)
            else { await abortable(direct!.aOut!.add(p, aFirst ? { decoderConfig: aConfig! } : undefined), signal); aFirst = false }
        }

        /** Writes one packet of a unit that was held back (parallel "Save to file…") into the output, where the head unit's own packets go through emitVideo / emitAudio. */
        const emitRecord = async (r: LogRecord): Promise<void> => {
            const p = new EncodedPacket(r.data, r.key ? 'key' : 'delta', r.timestamp, r.duration)
            if (r.track === 0) { await direct!.vOut.add(p, vFirst ? { decoderConfig: vConfig! } : undefined); vFirst = false }
            else if (direct!.aOut) { await direct!.aOut.add(p, aFirst ? { decoderConfig: aConfig! } : undefined); aFirst = false }
        }

        const makeEnv = (scaler: GlScaler | null): UnitEnv => {
            const canvas = new OffscreenCanvas(W, H)
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('no 2D canvas')
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            return { canvas, ctx, gl: scaler, writer: null, cancelled: false, stop: new AbortController(), work: 0, labels: new Set() }
        }
        const mainEnv = makeEnv(gl0)
        const durUs = Math.round(frameSec * 1e6)
        const tsUs = (frame: number): number => Math.round(frame * frameSec * 1e6)

        /** One encoder session for a unit: `produce` hands over frames; finished packets go to the writer in order. */
        const encodeUnit = async (env: UnitEnv, produce: (encode: (frame: VideoFrame, key: boolean) => Promise<void>) => Promise<void>): Promise<void> => {
            const pending: EncodedPacket[] = []
            let failure: unknown = null
            const failed = new AbortController()
            // Cancel (or the pool giving up on this unit) must get through even when the encoder never answers again: it stops the encoder and every wait below.
            const stopper = anyAbort(signal, env.stop.signal)
            const onStop = (): void => { failure ??= cancelledError(); failed.abort() }
            /** A wait that ends with the failure (the encoder's error, or the cancel) instead of hanging. */
            const guard = <T,>(p: Promise<T>): Promise<T> => abortable(p, failed.signal).catch((e: unknown) => { throw failure ?? e })
            let description: Uint8Array | null = null
            let codec: string | null = null
            const enc = new VideoEncoder({
                output: (chunk, meta) => {
                    const data = new Uint8Array(chunk.byteLength)
                    chunk.copyTo(data)
                    pending.push(new EncodedPacket(data, chunk.type, chunk.timestamp / 1e6, (chunk.duration ?? durUs) / 1e6))
                    const d = meta?.decoderConfig?.description
                    if (meta?.decoderConfig && !codec) codec = meta.decoderConfig.codec
                    if (d && !description) description = d instanceof Uint8Array ? d.slice() : new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : (d as ArrayBuffer).slice(0))
                },
                error: (e) => { failure = e; failed.abort() },
            })
            const drain = async (): Promise<void> => {
                if (pending.length === 0) return
                if (!vConfig) {
                    if (!description) throw new Error('the encoder gave no parameter sets')
                    vConfig = { codec: codec ?? encoder!.config.codec, codedWidth: W, codedHeight: H, description }
                    diag.note(`H.264 sample entry ${vConfig.codec}`)
                } else if (description && !sameBytes(vConfig.description as Uint8Array | undefined, description)) {
                    throw new Error('the encoder changed its profile or level since the render was saved: discard the saved render and start again')
                }
                while (pending.length) await emitVideo(env, pending.shift()!)
            }
            try {
                stopper.signal.addEventListener('abort', onStop, { once: true })
                if (stopper.signal.aborted) onStop()
                enc.configure(encoder!.config)
                await produce(async (frame, key) => {
                    if (failure) { frames.close(frame); throw failure }
                    const t1 = now()
                    try { enc.encode(frame, { keyFrame: key }) } finally { frames.close(frame) }
                    const t2 = now()
                    await waitForQueue(enc, exp?.encodeQueue ?? 3, failed.signal)
                    const t3 = now()
                    if (failure) throw failure
                    await guard(drain())
                    const t4 = now()
                    stats.frames++; stats.encodeCallMs += t2 - t1; stats.backpressureMs += t3 - t2; stats.drainMs += t4 - t3
                })
                await guard(enc.flush())
                if (failure) throw failure
                await guard(drain())
            } finally {
                stopper.signal.removeEventListener('abort', onStop)
                stopper.dispose()
                if (enc.state !== 'closed') enc.close()
            }
        }

        const reportProgress = (stage?: string): void => onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: (meter.set(done), meter.fraction()), ...(stage ? { stage } : {}) })
        const failedOverlays = new Set<RenderOverlay>()
        const paintOverlays = (env: UnitEnv, active: RenderOverlay[], tSrc: number): void => {
            const ctx = env.ctx
            for (const o of active) {
                if (failedOverlays.has(o)) continue
                ctx.save()
                try { o.paint(ctx, tSrc - o.startSec) } catch (e) { failedOverlays.add(o); skip(o.label, errorText(e), e) } finally { ctx.restore() }
            }
        }

        // ---- cards ----
        const runCard = async (env: UnitEnv, card: RenderCard, stage: string): Promise<void> => {
            const { canvas, ctx } = env
            const n = cardFrames(card)
            const paintAt = (t: number): void => {
                ctx.save()
                ctx.fillStyle = '#000'
                ctx.fillRect(0, 0, W, H)
                card.paint(ctx, t)
                ctx.restore()
            }
            // Fail before anything is written: a card that cannot be painted is left out.
            try { paintAt(card.fade ? card.durationSec / 2 : 0) } catch (e) { skip(card.label, errorText(e), e); return }
            let still: ImageBitmap | null = null
            if (card.fade) { paintAt(card.durationSec / 2); still = await createImageBitmap(canvas) }
            const startFrame = cursorFrames
            const frameW = (card === g?.intro ? work.sections[0] : work.sections[work.sections.length - 1]).seconds / n
            try {
                await encodeUnit(env, async (encode) => {
                    for (let i = 0; i < n; i++) {
                        if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                        if (still && card.fade) {
                            ctx.fillStyle = '#000'
                            ctx.fillRect(0, 0, W, H)
                            ctx.globalAlpha = Math.max(0, Math.min(1, card.fade(i * frameSec)))
                            ctx.drawImage(still, 0, 0)
                            ctx.globalAlpha = 1
                        } else paintAt(i * frameSec)
                        await encode(frames.make(new VideoFrame(canvas, { timestamp: tsUs(startFrame + i), duration: durUs })), i % keyFrames === 0)
                        done += frameW
                        if (i % 30 === 0) reportProgress(stage)
                    }
                })
            } finally {
                still?.close()
            }
            report.applied.push(card.label)
            env.labels.add(card.label)
            diag.graphicApplied(card.label)
            if (hasAudio) for (const p of (await silencePackets(n * frameSec)) ?? []) await emitAudio(env, p.clone({ timestamp: startFrame * frameSec + p.timestamp }))
            cursorFrames += n
        }

        // ---- footage segments ----
        const runSegment = async (env: UnitEnv, seg: Segment, startFrame: number, parallel = false): Promise<void> => {
            const { canvas, ctx } = env
            const v = valid[seg.cutIndex]
            const cut = v.cut
            const src = opened[cut.sourceIndex]
            const speed = cut.speed ?? 1
            const a = sourceTimeOf(cut, seg.firstFrame, frameSec)
            const b = sourceTimeOf(cut, seg.firstFrame + seg.frames, frameSec)
            const overlays = resolved.get(v.ci) ?? []
            // The picture nearest in time: a source whose frames sit between output ticks (edit-list offsets, VFR) is at most half a frame off.
            const eps = frameSec * 0.5
            // Work per output frame of this cut: the plain share, plus the painting for frames drawn on the canvas.
            const sec = work.sections[seg.cutIndex + 1]
            const paintW = priceUnits({ ...ZERO_UNITS, paintSec: sec.units.paintSec }, pricing)
            const baseFrameW = (sec.seconds - paintW) / cutFrames(cut, frameSec)
            const paintFrameW = paintW / Math.max(1, sec.units.paintSec / frameSec)
            const stopped = anyAbort(signal, env.stop.signal)
            const sink = new VideoSampleSink(src.video)
            const plainIterator = sink.samples(a)[Symbol.asyncIterator]()
            // Experiment 9: read decoded pictures ahead of the painting/encoding loop.
            const iterator = (exp?.decodeAhead ?? 0) > 0 ? readAhead(plainIterator, exp!.decodeAhead!) : plainIterator
            let cur: VideoSample | null = null
            let next: VideoSample | null = null
            let ended = false
            const advance = async (tSrc: number): Promise<void> => {
                for (;;) {
                    if (!next && !ended) {
                        const r = await abortable(iterator.next(), stopped.signal)
                        if (r.done) ended = true
                        else next = r.value
                    }
                    if (next && (!cur || next.timestamp <= tSrc + eps)) { cur?.close(); cur = next; next = null; continue }
                    return
                }
            }
            try {
                await encodeUnit(env, async (encode) => {
                    for (let j = 0; j < seg.frames; j++) {
                        if (signal?.aborted || env.cancelled) throw new DOMException('Render cancelled', 'AbortError')
                        const tSrc = a + j * frameSec * speed
                        const tDec = now()
                        await advance(tSrc)
                        const tPaint = now()
                        stats.decodeWaitMs += tPaint - tDec
                        const s = cur as VideoSample | null
                        if (!s) throw new Error(`${sources[cut.sourceIndex].name}: no picture at ${a.toFixed(1)} s`)
                        const active = overlays.filter((o) => !failedOverlays.has(o) && tSrc >= o.startSec - 1e-6 && tSrc < o.startSec + o.durationSec)
                        const dw = s.displayWidth
                        const dh = s.displayHeight
                        const sameSize = dw === W && dh === H
                        const big = directScale && !cut.crop && s.rotation === 0 && isDownscale(dw, dh, W, H)
                        const plain = !cut.crop && active.length === 0 && s.rotation === 0 && !out.forceCanvas && (sameSize || big)
                        let frame: VideoFrame
                        let gpuFrame: VideoFrame | null = null
                        if (plain) {
                            const f = s.toVideoFrame()
                            // A larger frame goes to the encoder as it is; the encoder scales it to the configured size.
                            try { frame = frames.make(new VideoFrame(f, { timestamp: tsUs(startFrame + j), duration: durUs })) } finally { f.close() }
                            if (!sameSize) scaled.direct++
                        } else if (gpuPath && s.rotation === 0 && (gpuFrame = gpuPath.tryFrame(s, coverRect(dw, dh, W, H, cut.crop), active.length ? (c) => paintOverlays({ ...env, ctx: c }, active, tSrc) : null, tsUs(startFrame + j), durUs, (t) => diag.note(t)))) {
                            frame = frames.make(gpuFrame)
                            for (const o of active) if (!failedOverlays.has(o) && o.label && !report.applied.includes(o.label)) { report.applied.push(o.label); diag.graphicApplied(o.label) }
                        } else {
                            const r = coverRect(dw, dh, W, H, cut.crop)
                            let viaGl = false
                            if (env.gl && s.rotation === 0 && dw >= W * 1.4 && dh >= H * 1.4) {
                                const f = s.toVideoFrame()
                                try { env.gl.draw(f, r.sx, r.sy, r.sw, r.sh); ctx.drawImage(env.gl.canvas, 0, 0); viaGl = true } catch (e) {
                                    diag.note(`WebGL scaling failed (${errorText(e)}); using the 2D canvas from here`)
                                    env.gl.dispose(); env.gl = null
                                } finally { f.close() }
                            }
                            if (viaGl) scaled.webgl++
                            else {
                                if (dw >= W * 1.4) scaled.canvas++
                                if (r.sx === 0 && r.sy === 0 && Math.abs(r.sw - dw) < 1e-6 && Math.abs(r.sh - dh) < 1e-6) s.draw(ctx, 0, 0, W, H)
                                else s.draw(ctx, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H)
                            }
                            paintOverlays(env, active, tSrc)
                            for (const o of active) if (!failedOverlays.has(o) && o.label) { env.labels.add(o.label); if (!report.applied.includes(o.label)) { report.applied.push(o.label); diag.graphicApplied(o.label) } }
                            frame = frames.make(new VideoFrame(canvas, { timestamp: tsUs(startFrame + j), duration: durUs }))
                        }
                        stats.paintMs += now() - tPaint
                        await encode(frame, j === 0 || (seg.firstFrame + j) % keyFrames === 0)
                        const w = baseFrameW + (plain ? 0 : paintFrameW)
                        done += w; env.work += w
                        if (j % 30 === 0) reportProgress()
                    }
                })
            } finally {
                ;(cur as VideoSample | null)?.close()
                ;(next as VideoSample | null)?.close()
                // A decoder that never answers would never let its iterator return: only wait for it when nothing was cancelled (the source input is disposed at the end anyway).
                if (stopped.signal.aborted) void iterator.return?.(undefined).catch(() => undefined)
                else await iterator.return?.(undefined).catch(() => undefined)
                stopped.dispose()
            }
            // Audio for the same stretch, on the same clock as the video.
            if (signal?.aborted || env.cancelled) throw cancelledError()
            if (hasAudio) {
                const outSec = seg.frames * frameSec
                const startSec = startFrame * frameSec
                let packets: EncodedPacket[] | null = null
                if (cut.silent || !src.audio) packets = await silencePackets(outSec)
                else if (speed !== 1 || (cut.gain ?? 1) !== 1 || !copyAac) {
                    packets = await encodeReplayAudio(src.audio, { startSec: a, endSec: b, speed, gain: cut.gain ?? 1, outDurationSec: outSec, bitrate: AUDIO_BITRATE })
                        .catch((e: unknown) => { console.warn('Audio: re-encoding failed, using silence', e); return null })
                    if (!packets) {
                        diag.note(`Audio at ${a.toFixed(1)} s of source #${cut.sourceIndex} could not be encoded: replaced by silence`)
                        packets = await silencePackets(outSec)
                    }
                }
                if (packets) for (const p of packets) await emitAudio(env, p.clone({ timestamp: startSec + p.timestamp }))
                else {
                    const aSink = new EncodedPacketSink(src.audio!)
                    // (The first audio packet can start after the cut does, e.g. at 0.02 s when the cut starts at 0.)
                    const a0 = await aSink.getPacket(a) ?? await aSink.getFirstPacket()
                    if (a0) {
                        for await (const p of aSink.packets(a0)) {
                            if (p.timestamp >= b - 1e-6) break
                            if (p.timestamp < a - 1e-6) continue
                            await emitAudio(env, p.clone({ timestamp: startSec + (p.timestamp - a) }))
                        }
                    }
                }
            }
            if (seg.firstFrame === 0) timings[v.ci] = cutTiming(startFrame * frameSec, cut.startSec, cut.endSec, speed)
            if (!parallel) cursorFrames += seg.frames
            copied = true
        }

        const runUnit = async (u: number): Promise<void> => {
            const unit = units[u]
            if (unit.kind === 'intro') { if (g?.intro) await runCard(mainEnv, g.intro, 'Title card') }
            else if (unit.kind === 'outro') {
                if (!copied) throw new Error('Nothing to render: every cut is outside its file')
                if (g?.outro) await runCard(mainEnv, g.outro, g.outro.label || 'Full-time card')
            } else {
                const endCut = diag.begin('cuts')
                try { await runSegment(mainEnv, unit.segment, cursorFrames) } finally { endCut() }
            }
        }

        // ---- the unit cache: a unit whose key is in the store is copied into its log instead of being encoded ----
        /** Copies unit `u` from the cache into the unit log `env.writer` (timestamps moved to where the unit sits now); false = miss, and the log is empty again. */
        const restoreUnit = async (u: number, startFrame: number, env: UnitEnv): Promise<boolean> => {
            if (!store || !cacheOn || !reuse) return false
            try {
                const key = await unitKeyOf(u)
                if (!key || !cached.has(key)) return false
                const hit = await store.load(key)
                if (!hit) { cached.delete(key); return false }
                if (!hit.meta.video) return false
                const description = decodeDescription(hit.meta.video.description)
                if (vConfig && !sameBytes(vConfig.description as Uint8Array | undefined, description)) return false // another profile or level than this render's file
                const startSec = startFrame * frameSec
                try {
                    // Video lands back on the frame grid (the unit's first frame is frame `startFrame`); audio keeps its own times.
                    for await (const r of hit.records) await env.writer!.write({ ...r, timestamp: r.track === 0 ? tsUs(startFrame + Math.round(r.timestamp / frameSec)) / 1e6 : r.timestamp + startSec })
                } catch {
                    // A damaged cached unit counts as a miss: start the unit's log again and render it.
                    await env.writer!.abort().catch(() => undefined)
                    env.writer = await openUnit(jobKind, u)
                    cached.delete(key)
                    await store.remove(key)
                    return false
                }
                if (!vConfig) vConfig = { codec: hit.meta.video.codec, codedWidth: W, codedHeight: H, description }
                for (const l of hit.meta.applied) { env.labels.add(l); if (!report.applied.includes(l)) { report.applied.push(l); diag.graphicApplied(l) } }
                const unit = units[u]
                if (unit.kind === 'segment') {
                    const v = valid[unit.segment.cutIndex]
                    if (unit.segment.firstFrame === 0) timings[v.ci] = cutTiming(startSec, v.cut.startSec, v.cut.endSec, v.cut.speed ?? 1)
                    copied = true
                }
                usedKeys.set(u, key)
                reusedActual++
                return true
            } catch { return false }
        }
        /** Keeps a finished unit (its log is closed) in the cache. Never fails the render: no room, no storage or a skipped graphic just means it is not kept. */
        const keepUnit = async (u: number, startFrame: number, env: UnitEnv): Promise<void> => {
            if (!store || !cacheOn || !reuse || !vConfig || report.skipped.length > 0) return
            try {
                const key = await unitKeyOf(u)
                const description = encodeDescription(vConfig.description)
                if (!key || !description) return
                const expected = unitFrames(u)
                const unitBytes = expected * frameSec * out.videoBitrate / 8
                const free = await store.free()
                // Keep the room the render itself still needs (its output file is written when the units are done).
                if (free !== null && free < unitBytes * 1.3 + fullFrames * frameSec * out.videoBitrate / 8 * 1.3) return
                if (!(await store.hasRoomFor(unitBytes * 1.1))) return // the cache cap holds while an export runs, not only when it ends
                const startSec = startFrame * frameSec
                let videoFrames = 0
                async function* rel(): AsyncGenerator<LogRecord> { for await (const r of readUnit(jobKind, u)) { if (r.track === 0) videoFrames++; yield { ...r, timestamp: r.timestamp - startSec } } }
                if (!(await store.save(key, rel(), { applied: [...env.labels], video: { codec: vConfig.codec, description } }))) { cacheOn = false; return }
                if (videoFrames !== expected) { await store.remove(key); return } // not every frame was drawn: not a unit to reuse
                usedKeys.set(u, key)
            } catch { /* not kept */ }
        }
        const fullFrames = units.reduce((a, _, u) => a + unitFrames(u), 0)

        // ---- segments encoded concurrently, each with its own decoder, encoder, canvas and WebGL scaler ----
        /** A hardware encoder that failed is replaced by a software one (once per failure); false when there is nothing to fall back to. */
        const switchToSoftware = async (u: number, e: unknown): Promise<boolean> => {
            if (!journal || isAbort(e) || encoder!.hardware === 'prefer-software') return false
            const soft = await tuned(await pickH264Encoder(W, H, out.videoBitrate, fps, ['prefer-software']))
            if (!soft) return false
            diag.note(`Unit ${u}: ${errorText(e)}; retrying with a software encoder`)
            encoder = soft
            diag.finalEncoder(soft.config)
            return true
        }
        const runParallel = async (first: number, last: number): Promise<void> => {
            type Job = { u: number; start: number; frames: number; work: number }
            let startAt = cursorFrames
            const baseDone = done
            const jobs: Job[] = []
            for (let u = first; u <= last; u++) {
                const frames = (units[u] as { segment: Segment }).segment.frames
                jobs.push({ u, start: startAt, frames, work: 0 })
                startAt += frames
            }
            const envs = new Set<UnitEnv>()
            const finished = new Set<Job>()
            let prefix = 0 // jobs[0 .. prefix) are all finished: what a reload may keep
            let saving: Promise<void> = Promise.resolve()
            const saveProgress = (): void => {
                if (!journal) return
                const before = prefix
                while (prefix < jobs.length && finished.has(jobs[prefix])) prefix++
                if (prefix === before) return
                const lastDone = jobs[prefix - 1]
                const credited = baseDone + jobs.slice(0, prefix).reduce((a, j) => a + j.work, 0)
                const state = { ...journal!.state, unitsDone: lastDone.u + 1, cursor: (lastDone.start + lastDone.frames) * frameSec, done: credited, total: totalWork, copied, timings, report: structuredClone(report), video: vConfig }
                saving = saving.then(() => saveJob(state))
            }
            diag.note(`Running up to ${parallelN} units at a time`)
            // Without a journal the units meet in an ordered sink: the head streams into the file, the rest wait in memory.
            const sink = journal ? null : new OrderedSink(jobs.map((j) => j.u), emitRecord)
            const onAbort = (): void => sink?.cancel(new DOMException('Render cancelled', 'AbortError'))
            signal?.addEventListener('abort', onAbort)
            const pool = await runPool<Job>({
                jobs, width: parallelN, isAbort,
                run: async (job) => {
                    const env = makeEnv(mainEnv.gl ? GlScaler.create(W, H) : null)
                    envs.add(env)
                    const t1 = now()
                    try {
                        env.writer = sink ? sink.open(job.u) : await openUnit(jobKind, job.u)
                        const fromCache = await restoreUnit(job.u, job.start, env)
                        if (!fromCache) {
                            const endCut = diag.begin('cuts')
                            try { await runSegment(env, (units[job.u] as { segment: Segment }).segment, job.start, true) } finally { endCut() }
                        }
                        await env.writer!.close()
                        env.writer = null
                        job.work = env.work
                        finished.add(job)
                        stats.unitSpans.push({ unit: job.u, startMs: t1 - perfStart, endMs: now() - perfStart })
                        saveProgress()
                        reportProgress()
                        if (!fromCache) await keepUnit(job.u, job.start, env)
                    } catch (e) {
                        // Whatever this unit credited is taken back (the unit goes again, or the render stops): the shown progress only waits.
                        done -= env.work
                        await env.writer?.abort(e).catch(() => undefined)
                        env.writer = null
                        throw e
                    } finally {
                        envs.delete(env)
                        env.gl?.dispose()
                    }
                },
                onFallback: (job, e) => diag.note(`Unit ${job.u} failed while ${parallelN} ran at once (${errorText(e)}): running one unit at a time for the rest of this render`),
                retrySerial: (job, e) => switchToSoftware(job.u, e),
                onFatal: () => { for (const env of envs) { env.cancelled = true; env.stop.abort() } sink?.cancel(new DOMException('Render cancelled', 'AbortError')) },
                order: (a, b) => a.u - b.u,
            })
            signal?.removeEventListener('abort', onAbort)
            await saving
            if (pool.fellBack) diag.note('Parallel units: fell back to one at a time')
            cursorFrames = startAt
        }

        let pendingSave: (() => Promise<void>) | null = null
        const t0 = Date.now()
        try {
            for (let u = startUnit; u < units.length; u++) {
                if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                if (parallelN > 1 && units[u].kind === 'segment') {
                    let last = u
                    while (last + 1 < units.length && units[last + 1].kind === 'segment') last++
                    await runParallel(u, last)
                    if (journal) await saveJob({ ...journal.state, unitsDone: last + 1, cursor: cursorFrames * frameSec, done, total: totalWork, copied, timings, report: structuredClone(report), video: vConfig })
                    u = last
                    reportProgress()
                    continue
                }
                const snapshot = { cursorFrames, done }
                const uStart = now()
                for (let attempt = 0; ; attempt++) {
                    if (journal) mainEnv.writer = await openUnit(jobKind, u)
                    mainEnv.labels = new Set()
                    try {
                        if (journal && await restoreUnit(u, cursorFrames, mainEnv)) { cursorFrames += unitFrames(u); break }
                        const startFrame = cursorFrames
                        await runUnit(u)
                        // Kept after the unit's log is closed (below), only when the unit really drew all its frames.
                        pendingSave = journal && cursorFrames - startFrame === unitFrames(u) ? () => keepUnit(u, startFrame, mainEnv) : null
                        break
                    } catch (e) {
                        await mainEnv.writer?.abort()
                        mainEnv.writer = null
                        // A hardware encoder that fails mid-way is retried once in software (journaled renders only: nothing was written yet).
                        if (attempt === 0 && await switchToSoftware(u, e)) {
                            cursorFrames = snapshot.cursorFrames; done = snapshot.done
                            continue
                        }
                        throw e
                    }
                }
                if (journal && mainEnv.writer) {
                    await mainEnv.writer.close()
                    mainEnv.writer = null
                    if (pendingSave) { const save = pendingSave; pendingSave = null; await save() }
                    await saveJob({ ...journal.state, unitsDone: u + 1, cursor: cursorFrames * frameSec, done, total: totalWork, copied, timings, report: structuredClone(report), video: vConfig })
                }
                stats.unitSpans.push({ unit: u, startMs: uStart - perfStart, endMs: now() - perfStart })
                reportProgress()
            }
            diag.note(`Time breakdown (ms): decode wait ${Math.round(stats.decodeWaitMs)}, paint/scale ${Math.round(stats.paintMs)}, encode call ${Math.round(stats.encodeCallMs)}, encoder back-pressure ${Math.round(stats.backpressureMs)}, packet writes ${Math.round(stats.drainMs)} over ${stats.frames} frames`)
            if (shrinks) diag.note(`Scale path frames: ${scaled.direct} by the encoder, ${scaled.webgl} by WebGL, ${scaled.canvas} by the 2D canvas`)
            diag.note(`Re-encode took ${((Date.now() - t0) / 1000).toFixed(1)} s for ${cursorFrames} frames; VideoFrames made ${frames.made}, closed ${frames.closed}`)
            if (!vConfig) throw new Error('the encoder produced no video')
            const finalVideo: VideoDecoderConfig = vConfig
            let file: File | Blob
            if (journal) {
                onProgress({ cutIndex: cuts.length - 1, cutCount: cuts.length, fraction: 1, stage: 'Saving', ...(reusedActual > 0 ? { reused: { units: reusedActual, of: keyedUnits } } : {}) })
                const endMux = diag.begin('finalize')
                file = await muxUnits(jobKind, journal.state.outputName, units.length, 'avc', hasAudio ? 'aac' : null, finalVideo, aConfig, signal, exp?.targetFile)
                await discardJob(jobKind)
                endMux()
                // This export becomes the kind's "last export" in the cache: the parts it used stay, older ones go.
                if (store && cacheOn && reuse && usedKeys.size > 0) {
                    const sections: { k: string; u: string[] }[] = []
                    const section = async (part: string | null, us: number[]): Promise<void> => {
                        const ks = us.map((u) => usedKeys.get(u))
                        if (part && us.length > 0 && ks.every((k): k is string => !!k)) sections.push({ k: await digest(part), u: ks })
                    }
                    await section(reuse.intro, units.flatMap((x, u) => (x.kind === 'intro' ? [u] : [])))
                    await section(reuse.outro, units.flatMap((x, u) => (x.kind === 'outro' ? [u] : [])))
                    for (const [vi, v] of valid.entries()) await section(reuse.wholeCut(v.ci), units.flatMap((x, u) => (x.kind === 'segment' && x.segment.cutIndex === vi ? [u] : [])))
                    await store.finish(reuse.which, { units: [...usedKeys.entries()].sort((x, y) => x[0] - y[0]).map(([, k]) => k), sections })
                }
            } else {
                const endFin = diag.begin('finalize')
                await abortable(direct!.output.finalize(), signal)
                file = await abortable(direct!.result(), signal)
                endFin()
            }
            if (timingsKnown) opts.onTimeline?.(timings)
            opts.onGraphics?.(report)
            stats.units = units.length
            if (keyedUnits > 0) stats.reused = { units: reusedActual, of: keyedUnits }
            if (gpuPath) { stats.gpuFrames = gpuPath.frames; diag.note(`WebGPU path: ${gpuPath.frames} frames by WebGPU, ${stats.frames - gpuPath.frames} by the normal path${gpuPath.reason ? ` (stopped: ${gpuPath.reason})` : ''}`) }
            if (shrinks) stats.scalePath = `${scaled.direct} by the encoder, ${scaled.webgl} by WebGL, ${scaled.canvas} by the 2D canvas`
            opts.onStats?.(stats)
            return file
        } catch (e) {
            await mainEnv.writer?.abort()
            if (direct) {
                await direct.output.cancel().catch(() => undefined)
                await direct.discard()
            }
            // A cancelled render is forgotten; anything else (a frozen tab, a failure) can be resumed.
            if (journal && isAbort(e) && ownsJournal(jobKind, claim)) await discardJob(jobKind)
            if (store && isAbort(e)) await store.trim() // the parts a cancelled export saved are not any kind's "last export"
            if (!isAbort(e)) diag.note(`Re-encode failed: ${errorInfo(e).message}`)
            throw e
        }
    } finally {
        for (const s of opened) s?.input.dispose()
        gl0?.dispose()
        gpu0?.dispose()
    }
}

/** Same H.264 profile and level in two avcC records (the SPS may differ in its colour signalling between key frames). */
function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
    return !!a && a.length >= 4 && b.length >= 4 && a[1] === b[1] && a[3] === b[3]
}

/** Experiment 9: pulls up to `depth` pictures ahead of the consumer from a sample iterator (so decoding overlaps painting and encoding). */
export function readAhead(source: AsyncIterator<VideoSample>, depth: number): AsyncIterator<VideoSample> {
    const queue: VideoSample[] = []
    let ended = false
    let failure: unknown = null
    let pump: Promise<void> | null = null
    let closed = false
    let wake: (() => void) | null = null
    const notify = (): void => { const w = wake; wake = null; w?.() }
    const fill = (): Promise<void> => {
        if (!pump) {
            pump = (async () => {
                try {
                    while (!ended && !closed && queue.length < depth) {
                        const r = await source.next()
                        if (r.done) ended = true
                        else if (closed) r.value.close()
                        else { queue.push(r.value); notify() }
                    }
                } catch (e) { failure = e; ended = true }
                pump = null
                notify()
            })()
        }
        return pump
    }
    return {
        async next(): Promise<IteratorResult<VideoSample>> {
            for (;;) {
                const v = queue.shift()
                if (v) { void fill(); return { done: false, value: v } }
                if (failure) throw failure
                if (ended) return { done: true, value: undefined }
                await new Promise<void>((resolve) => { wake = resolve; void fill() })
            }
        },
        async return(): Promise<IteratorResult<VideoSample>> {
            closed = true
            await pump
            for (const v of queue.splice(0)) v.close()
            await source.return?.(undefined)
            return { done: true, value: undefined }
        },
    }
}
