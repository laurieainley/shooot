// The re-encoding render (Full match "4K" / "1080p"): every frame is decoded, drawn onto a canvas of the output size
// (scaled, replay crop, cards, captions, score bug) and encoded to H.264 on the spot, so graphics cost no extra pass.
// The output is a constant frame rate with a key frame every ~2 s. Audio is copied when it is AAC, else encoded to AAC.
//
// Resumable like the stream-copy engine: the render is a list of units (title card, segments of at most
// SEGMENT_SEC of output, full-time card); each finished unit is a packet log in OPFS and the job is saved in IndexedDB.
// Every unit starts with a key frame from its own encoder, so units join anywhere. An interrupted render loses at
// most the unit in progress (about two minutes of output).
import { EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output, VideoSampleSink, type VideoSample } from 'mediabunny'
import { RenderDiagnostics, errorInfo } from './diagnostics'
import { clipPartSeconds, replayPartAfter } from './captionJoin'
import { planAudio } from './audioPlan'
import { nominalFrameRate } from './frameGrid'
import { muxUnits } from './muxUnits'
import { coverRect } from './outputSize'
import { canJournal, discardJob, loadJob, openUnit, saveJob, type JobState, type UnitWriter } from './renderJob'
import { GlScaler, isDownscale, probeDirectScale } from './downscale'
import { encodeReplayAudio } from './replayAudio'
import { makeSilentAudio, type SilentAudio } from './silentAudio'
import { makeTarget, openSource, type OpenSource } from './sourceInput'
import { aacConfig, cutFrames, keyEvery, outputDimensions, outputFrameSec, planSegments, sourceTimeOf, type Segment } from './transcodePlan'
import { pickH264Encoder, type H264Encoder } from './transcodeSupport'
import type { Cut, CutTiming, GraphicsReport, RenderCard, RenderGraphics, RenderOptions, RenderOverlay, RenderSource } from './types'
import { waitForQueue } from './yield'
import { DEFAULT_COEF, WorkMeter, detectDeviceClass, factsOfSource, planWork, priceUnits, ZERO_UNITS } from '../utils/renderTime'
import { cutTiming } from '../utils/chapterTimes'
import { AUDIO_BITRATE } from '../utils/outputQuality'

/** Longest stretch of output one unit covers (progress is saved after each). */
export const SEGMENT_SEC = 120
const OUTPUT_NAME = 'highlights.mp4'
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

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
    let gl: GlScaler | null = null
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
        let encoder: H264Encoder | null = await pickH264Encoder(W, H, out.videoBitrate, fps)
        if (!encoder) throw new Error(`this browser cannot encode H.264 at ${W}×${H}`)
        diag.finalEncoder(encoder.config)
        diag.note(`Video encoder: ${encoder.config.codec}, hardwareAcceleration ${encoder.hardware}`)

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
            gl = GlScaler.create(W, H)
            diag.note(`Scale path: ${p.ok ? 'encoder scales plain frames' : `${gl ? 'WebGL' : '2D canvas'} for plain frames (encoder scaling unusable: ${p.reason})`}; ${gl ? 'WebGL for frames with graphics' : '2D canvas for frames with graphics (no WebGL2)'}`)
        }

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
        const segments = planSegments(planCuts, frameSec, Math.round(SEGMENT_SEC / frameSec))
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
        const totalWork = work.seconds || 1
        const meter = new WorkMeter(totalWork)
        onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: 0, stage: 'Starting', estimateSec: totalWork })
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

        // Journal (resumable) or direct output.
        let journal: { state: JobState } | null = null
        let startUnit = 0
        let timings: (CutTiming | null)[] = cuts.map(() => null)
        let timingsKnown = true
        let vConfig: VideoDecoderConfig | null = null
        let cursorFrames = 0
        let done = 0
        let copied = false
        if (opts.resumable && await canJournal()) {
            const prev = await loadJob()
            const same = prev && prev.signature === opts.resumable.signature && prev.graphics === !!g && prev.unitCount === units.length
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
                await discardJob()
                const state: JobState = {
                    kind: opts.resumable.kind, signature: opts.resumable.signature, outputName, graphics: !!g,
                    unitsDone: 0, unitCount: units.length, cursor: 0, done: 0, total: totalWork, copied: false, report: null,
                    video: null, audio: aConfig, updatedAt: Date.now(),
                }
                await saveJob(state)
                journal = { state }
            }
        }
        let direct: { output: Output; vOut: EncodedVideoPacketSource; aOut: EncodedAudioPacketSource | null; result: () => Promise<File | Blob>; discard: () => Promise<void> } | null = null
        if (!journal) {
            const { target, result, discard } = await makeTarget(outputName)
            const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
            const vOut = new EncodedVideoPacketSource('avc')
            output.addVideoTrack(vOut)
            const aOut = hasAudio ? new EncodedAudioPacketSource('aac') : null
            if (aOut) output.addAudioTrack(aOut)
            await output.start()
            direct = { output, vOut, aOut, result, discard }
        }
        let unitWriter: UnitWriter | null = null
        let vFirst = true
        let aFirst = true
        const emitVideo = async (p: EncodedPacket): Promise<void> => {
            if (unitWriter) await unitWriter.write({ track: 0, key: p.type === 'key', timestamp: p.timestamp, duration: p.duration, data: p.data })
            else { await direct!.vOut.add(p, vFirst ? { decoderConfig: vConfig! } : undefined); vFirst = false }
        }
        const emitAudio = async (p: EncodedPacket): Promise<void> => {
            if (unitWriter) await unitWriter.write({ track: 1, key: true, timestamp: p.timestamp, duration: p.duration, data: p.data })
            else { await direct!.aOut!.add(p, aFirst ? { decoderConfig: aConfig! } : undefined); aFirst = false }
        }

        const canvas = new OffscreenCanvas(W, H)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no 2D canvas')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        const durUs = Math.round(frameSec * 1e6)
        const tsUs = (frame: number): number => Math.round(frame * frameSec * 1e6)

        /** One encoder session for a unit: `produce` hands over frames; finished packets go to the writer in order. */
        const encodeUnit = async (produce: (encode: (frame: VideoFrame, key: boolean) => Promise<void>) => Promise<void>): Promise<void> => {
            const pending: EncodedPacket[] = []
            let failure: unknown = null
            const failed = new AbortController()
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
                while (pending.length) await emitVideo(pending.shift()!)
            }
            try {
                enc.configure(encoder!.config)
                await produce(async (frame, key) => {
                    if (failure) { frames.close(frame); throw failure }
                    try { enc.encode(frame, { keyFrame: key }) } finally { frames.close(frame) }
                    await waitForQueue(enc, 3, failed.signal)
                    if (failure) throw failure
                    await drain()
                })
                await enc.flush()
                if (failure) throw failure
                await drain()
            } finally {
                if (enc.state !== 'closed') enc.close()
            }
        }

        const reportProgress = (stage?: string): void => onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: (meter.set(done), meter.fraction()), ...(stage ? { stage } : {}) })
        const failedOverlays = new Set<RenderOverlay>()
        const paintOverlays = (active: RenderOverlay[], tSrc: number): void => {
            for (const o of active) {
                if (failedOverlays.has(o)) continue
                ctx.save()
                try { o.paint(ctx, tSrc - o.startSec) } catch (e) { failedOverlays.add(o); skip(o.label, errorText(e), e) } finally { ctx.restore() }
            }
        }

        // ---- cards ----
        const runCard = async (card: RenderCard, stage: string): Promise<void> => {
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
                await encodeUnit(async (encode) => {
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
            diag.graphicApplied(card.label)
            if (hasAudio) for (const p of (await silencePackets(n * frameSec)) ?? []) await emitAudio(p.clone({ timestamp: startFrame * frameSec + p.timestamp }))
            cursorFrames += n
        }

        // ---- footage segments ----
        const runSegment = async (seg: Segment): Promise<void> => {
            const v = valid[seg.cutIndex]
            const cut = v.cut
            const src = opened[cut.sourceIndex]
            const speed = cut.speed ?? 1
            const startFrame = cursorFrames
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
            const sink = new VideoSampleSink(src.video)
            const iterator = sink.samples(a)[Symbol.asyncIterator]()
            let cur: VideoSample | null = null
            let next: VideoSample | null = null
            let ended = false
            const advance = async (tSrc: number): Promise<void> => {
                for (;;) {
                    if (!next && !ended) {
                        const r = await iterator.next()
                        if (r.done) ended = true
                        else next = r.value
                    }
                    if (next && (!cur || next.timestamp <= tSrc + eps)) { cur?.close(); cur = next; next = null; continue }
                    return
                }
            }
            try {
                await encodeUnit(async (encode) => {
                    for (let j = 0; j < seg.frames; j++) {
                        if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                        const tSrc = a + j * frameSec * speed
                        await advance(tSrc)
                        const s = cur as VideoSample | null
                        if (!s) throw new Error(`${sources[cut.sourceIndex].name}: no picture at ${a.toFixed(1)} s`)
                        const active = overlays.filter((o) => !failedOverlays.has(o) && tSrc >= o.startSec - 1e-6 && tSrc < o.startSec + o.durationSec)
                        const dw = s.displayWidth
                        const dh = s.displayHeight
                        const sameSize = dw === W && dh === H
                        const big = directScale && !cut.crop && s.rotation === 0 && isDownscale(dw, dh, W, H)
                        const plain = !cut.crop && active.length === 0 && s.rotation === 0 && !out.forceCanvas && (sameSize || big)
                        let frame: VideoFrame
                        if (plain) {
                            const f = s.toVideoFrame()
                            // A larger frame goes to the encoder as it is; the encoder scales it to the configured size.
                            try { frame = frames.make(new VideoFrame(f, { timestamp: tsUs(startFrame + j), duration: durUs })) } finally { f.close() }
                            if (!sameSize) scaled.direct++
                        } else {
                            const r = coverRect(dw, dh, W, H, cut.crop)
                            let viaGl = false
                            if (gl && s.rotation === 0 && dw >= W * 1.4 && dh >= H * 1.4) {
                                const f = s.toVideoFrame()
                                try { gl.draw(f, r.sx, r.sy, r.sw, r.sh); ctx.drawImage(gl.canvas, 0, 0); viaGl = true } catch (e) {
                                    diag.note(`WebGL scaling failed (${errorText(e)}); using the 2D canvas from here`)
                                    gl.dispose(); gl = null
                                } finally { f.close() }
                            }
                            if (viaGl) scaled.webgl++
                            else {
                                if (dw >= W * 1.4) scaled.canvas++
                                if (r.sx === 0 && r.sy === 0 && Math.abs(r.sw - dw) < 1e-6 && Math.abs(r.sh - dh) < 1e-6) s.draw(ctx, 0, 0, W, H)
                                else s.draw(ctx, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H)
                            }
                            paintOverlays(active, tSrc)
                            for (const o of active) if (!failedOverlays.has(o) && o.label && !report.applied.includes(o.label)) { report.applied.push(o.label); diag.graphicApplied(o.label) }
                            frame = frames.make(new VideoFrame(canvas, { timestamp: tsUs(startFrame + j), duration: durUs }))
                        }
                        await encode(frame, j === 0 || (seg.firstFrame + j) % keyFrames === 0)
                        done += baseFrameW + (plain ? 0 : paintFrameW)
                        if (j % 30 === 0) reportProgress()
                    }
                })
            } finally {
                ;(cur as VideoSample | null)?.close()
                ;(next as VideoSample | null)?.close()
                await iterator.return?.(undefined).catch(() => undefined)
            }
            // Audio for the same stretch, on the same clock as the video.
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
                if (packets) for (const p of packets) await emitAudio(p.clone({ timestamp: startSec + p.timestamp }))
                else {
                    const aSink = new EncodedPacketSink(src.audio!)
                    // (The first audio packet can start after the cut does, e.g. at 0.02 s when the cut starts at 0.)
                    const a0 = await aSink.getPacket(a) ?? await aSink.getFirstPacket()
                    if (a0) {
                        for await (const p of aSink.packets(a0)) {
                            if (p.timestamp >= b - 1e-6) break
                            if (p.timestamp < a - 1e-6) continue
                            await emitAudio(p.clone({ timestamp: startSec + (p.timestamp - a) }))
                        }
                    }
                }
            }
            if (seg.firstFrame === 0) timings[v.ci] = cutTiming(startFrame * frameSec, cut.startSec, cut.endSec, speed)
            cursorFrames += seg.frames
            copied = true
        }

        const runUnit = async (u: number): Promise<void> => {
            const unit = units[u]
            if (unit.kind === 'intro') { if (g?.intro) await runCard(g.intro, 'Title card') }
            else if (unit.kind === 'outro') {
                if (!copied) throw new Error('Nothing to render: every cut is outside its file')
                if (g?.outro) await runCard(g.outro, g.outro.label || 'Full-time card')
            } else {
                const endCut = diag.begin('cuts')
                try { await runSegment(unit.segment) } finally { endCut() }
            }
        }

        const t0 = Date.now()
        try {
            for (let u = startUnit; u < units.length; u++) {
                if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                const snapshot = { cursorFrames, done }
                for (let attempt = 0; ; attempt++) {
                    if (journal) unitWriter = await openUnit(u)
                    try {
                        await runUnit(u)
                        break
                    } catch (e) {
                        await unitWriter?.abort()
                        unitWriter = null
                        // A hardware encoder that fails mid-way is retried once in software (journaled renders only: nothing was written yet).
                        if (journal && attempt === 0 && !isAbort(e) && encoder!.hardware !== 'prefer-software') {
                            const soft = await pickH264Encoder(W, H, out.videoBitrate, fps, ['prefer-software'])
                            if (soft) {
                                diag.note(`Unit ${u}: ${errorText(e)}; retrying with a software encoder`)
                                encoder = soft
                                diag.finalEncoder(soft.config)
                                cursorFrames = snapshot.cursorFrames; done = snapshot.done
                                continue
                            }
                        }
                        throw e
                    }
                }
                if (journal && unitWriter) {
                    await unitWriter.close()
                    unitWriter = null
                    await saveJob({ ...journal.state, unitsDone: u + 1, cursor: cursorFrames * frameSec, done, total: totalWork, copied, timings, report: structuredClone(report), video: vConfig })
                }
                reportProgress()
            }
            if (shrinks) diag.note(`Scale path frames: ${scaled.direct} by the encoder, ${scaled.webgl} by WebGL, ${scaled.canvas} by the 2D canvas`)
            diag.note(`Re-encode took ${((Date.now() - t0) / 1000).toFixed(1)} s for ${cursorFrames} frames; VideoFrames made ${frames.made}, closed ${frames.closed}`)
            if (!vConfig) throw new Error('the encoder produced no video')
            const finalVideo: VideoDecoderConfig = vConfig
            let file: File | Blob
            if (journal) {
                onProgress({ cutIndex: cuts.length - 1, cutCount: cuts.length, fraction: 1, stage: 'Saving' })
                const endMux = diag.begin('finalize')
                file = await muxUnits(journal.state.outputName, units.length, 'avc', hasAudio ? 'aac' : null, finalVideo, aConfig, signal)
                await discardJob()
                endMux()
            } else {
                const endFin = diag.begin('finalize')
                await direct!.output.finalize()
                file = await direct!.result()
                endFin()
            }
            if (timingsKnown) opts.onTimeline?.(timings)
            opts.onGraphics?.(report)
            return file
        } catch (e) {
            await unitWriter?.abort()
            if (direct) {
                await direct.output.cancel().catch(() => undefined)
                await direct.discard()
            }
            // A cancelled render is forgotten; anything else (a frozen tab, a failure) can be resumed.
            if (journal && isAbort(e)) await discardJob()
            if (!isAbort(e)) diag.note(`Re-encode failed: ${errorInfo(e).message}`)
            throw e
        }
    } finally {
        for (const s of opened) s?.input.dispose()
        gl?.dispose()
    }
}

/** Same H.264 profile and level in two avcC records (the SPS may differ in its colour signalling between key frames). */
function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
    return !!a && a.length >= 4 && b.length >= 4 && a[1] === b[1] && a[3] === b[3]
}
