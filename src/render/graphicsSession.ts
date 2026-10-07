// Generated video spliced into stream-copied footage (cards and overlays), following the spike's three rules:
// parameter sets in-band on every key frame, a sample entry whose SPS covers every other SPS in the track,
// and generated frames tagged with the footage colour space.
import { EncodedPacket, type InputVideoTrack } from 'mediabunny'
import { ensureGraphicsFonts } from '../graphics/assets'
import { frameDuration, presentationRanks } from './frameGrid'
import { describeParams, type RenderDiagnostics } from './diagnostics'
import { covers, craToBla, paramSets, pickSampleEntry, raiseEntry, raisedLimits, spsLimits, spsOf, withInbandParams, type SpsLimits } from './nal'
import { overlaySpans, type Gop, type ReencodeSpan } from './overlayWindow'
import { cropPixels } from '../utils/crop'
import { coverRect } from './outputSize'
import { describeOutput, encodeSegment, i420Frame, probeEncoders, withBitrate, type EncoderSetup } from './segmentEncoder'
import { applyOverlay, convertRange, fadeI420, i420Layout, isYuv420, matrixOf, prepareOverlay, rgbaToI420, targetColorSpace, type PlaneLayout, type PreparedOverlay, type YuvPlanes } from './yuvBlend'
import type { RenderCard, RenderOverlay } from './types'

export type GraphicsSource = { video: InputVideoTrack; config: VideoDecoderConfig; nalLength: number }

/** Sources of a different frame size than the output: their footage is re-encoded scaled to cover it. */

/** A packet for the output track. `splice`: a footage key the copy resumes at (leading pictures dropped). */
export type OutItem = { packet: EncodedPacket; generated: boolean; splice: boolean }

export type OverlayResult = { items: OutItem[]; applied: string[]; skipped: { label: string; reason: string }[] }

type OverlayCache = { words: Uint32Array | null; prepared: PreparedOverlay | null }

function sameWords(a: Uint32Array, b: Uint32Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export class GraphicsSession {
    readonly hevc: boolean
    /** Decoder config for the MP4 sample entry. */
    readonly entry: VideoDecoderConfig
    readonly frameSec: number
    private readonly width: number
    private readonly height: number
    /** Colour space of every generated frame: the footage's (matrix, range, primaries, transfer). */
    private readonly colorSpace: VideoColorSpaceInit
    private readonly setup: EncoderSetup
    private readonly entryLimits: SpsLimits
    private readonly footageParams: Map<GraphicsSource, Uint8Array[]>
    private readonly rescaled: Set<GraphicsSource>
    private readonly diag: RenderDiagnostics | undefined

    constructor(o: {
        hevc: boolean; entry: VideoDecoderConfig; frameSec: number; width: number; height: number
        colorSpace: VideoColorSpaceInit; setup: EncoderSetup; entryLimits: SpsLimits; footageParams: Map<GraphicsSource, Uint8Array[]>; rescaled: Set<GraphicsSource>; diag?: RenderDiagnostics
    }) {
        this.diag = o.diag
        this.hevc = o.hevc
        this.entry = o.entry
        this.frameSec = o.frameSec
        this.width = o.width
        this.height = o.height
        this.colorSpace = o.colorSpace
        this.setup = o.setup
        this.entryLimits = o.entryLimits
        this.footageParams = o.footageParams
        this.rescaled = o.rescaled
    }

    /** True for footage of another size than the output: every frame of it is decoded, scaled to cover and re-encoded. */
    rescales(src: GraphicsSource): boolean {
        return this.rescaled.has(src)
    }

    /** A copied footage key frame with its own parameter sets in-band (and BLA when it is a splice point). */
    footageKey(src: GraphicsSource, data: Uint8Array, splice: boolean): Uint8Array {
        const params = this.footageParams.get(src)
        const withParams = params ? withInbandParams(data, params, this.hevc, src.nalLength) : data
        return splice && this.hevc ? craToBla(withParams, src.nalLength) ?? withParams : withParams
    }

    /** Checks an encoded run against the sample entry and puts its parameter sets on its key frames. */
    private finish(packets: EncodedPacket[], description: Uint8Array | null, nalLength: number, what: string): EncodedPacket[] {
        if (!description) throw new Error('the encoder gave no parameter sets')
        this.diag?.generated(what, describeParams(description, this.hevc))
        const out = describeOutput(description, this.hevc)
        if (out.nalLength !== nalLength) throw new Error('the encoder changed its NAL length size')
        if (!covers(this.entryLimits, out.limits)) throw new Error('the encoder changed its frame size or reference count')
        if (packets.length === 0 || packets[0].type !== 'key') throw new Error('the encoder did not start with a key frame')
        return packets.map((p) => (p.type === 'key' ? new EncodedPacket(withInbandParams(p.data, out.params, this.hevc, nalLength), 'key', p.timestamp, p.duration) : p))
    }

    /** Encodes a card; packets are timed from 0 on the footage's frame grid. */
    async card(card: RenderCard, onFrame?: (fraction: number) => void): Promise<EncodedPacket[]> {
        const { width: W, height: H, frameSec } = this
        const n = Math.max(1, Math.round(card.durationSec / frameSec))
        const keyEvery = Math.max(1, Math.round(1 / frameSec))
        const canvas = new OffscreenCanvas(W, H)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('no 2D canvas')
        const durUs = Math.round(frameSec * 1e6)
        const matrix = matrixOf(this.colorSpace.matrix)
        const full = this.colorSpace.fullRange ?? false
        let prev: Uint32Array | null = null
        let yuv: Uint8Array | null = null
        let still: Uint8Array | null = null
        if (card.fade) {
            card.paint(ctx, card.durationSec / 2)
            still = rgbaToI420(ctx.getImageData(0, 0, W, H).data, W, H, matrix, full)
            yuv = new Uint8Array(still.length)
        }
        const { packets, description } = await encodeSegment(this.setup.config, async (encode) => {
            for (let i = 0; i < n; i++) {
                if (still && yuv && card.fade) {
                    fadeI420(still, yuv, W * H, card.fade(i * frameSec), full)
                    await encode(i420Frame(yuv, W, H, Math.round(i * frameSec * 1e6), durUs, this.colorSpace), i % keyEvery === 0)
                    onFrame?.((i + 1) / n)
                    continue
                }
                ctx.save()
                ctx.clearRect(0, 0, W, H)
                card.paint(ctx, i * frameSec)
                ctx.restore()
                // Our own RGB→YUV with the footage's matrix and range (encoders pick their own for RGBA input).
                // Cards are still between fades, so reuse the last conversion when nothing changed.
                const rgba = ctx.getImageData(0, 0, W, H).data
                const words = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength / 4)
                if (!yuv || !prev || !sameWords(prev, words)) yuv = rgbaToI420(rgba, W, H, matrix, full)
                prev = words
                await encode(i420Frame(yuv, W, H, Math.round(i * frameSec * 1e6), durUs, this.colorSpace), i % keyEvery === 0)
                onFrame?.((i + 1) / n)
            }
        })
        if (packets.length !== n) throw new Error(`the encoder returned ${packets.length} of ${n} frames`)
        const ranks = presentationRanks(packets.map((p) => p.timestamp))
        const timed = packets.map((p, i) => p.clone({ timestamp: ranks[i] * frameSec, duration: frameSec }))
        return this.finish(timed, description, this.setup.nalLength, `card: ${card.label}`)
    }

    /**
     * Draws overlays over one cut. `packets` are the cut's packets in decode order (leading pictures of the first
     * key already dropped), `cutEnd` the end of its last frame. GOPs under an overlay are decoded, painted and
     * re-encoded; the rest are passed through. A span that fails is passed through unchanged and reported.
     */
    async overlayCut(src: GraphicsSource, packets: EncodedPacket[], cutEnd: number, overlays: RenderOverlay[]): Promise<OverlayResult> {
        const keyIdx: number[] = []
        packets.forEach((p, i) => { if (p.type === 'key') keyIdx.push(i) })
        const gops: Gop[] = keyIdx.map((k, g) => {
            const end = keyIdx[g + 1] ?? packets.length
            let start = packets[k].timestamp
            for (let i = k; i < end; i++) start = Math.min(start, packets[i].timestamp)
            return { key: packets[k].timestamp, start }
        })
        const spans = overlaySpans(gops, cutEnd, overlays.map((o) => [o.startSec, o.startSec + o.durationSec]))
        const result: OverlayResult = { items: [], applied: [], skipped: [] }
        const replaced = new Map<number, { span: ReencodeSpan; packets: EncodedPacket[] }>()
        for (const span of spans) {
            const mine = overlays.filter((o) => span.windows.some(([a, b]) => o.startSec < b && o.startSec + o.durationSec > a))
            try {
                const out = await this.reencodeSpan(src, packets, keyIdx, span, mine)
                replaced.set(keyIdx[span.from], { span, packets: out })
                result.applied.push(...mine.map((o) => o.label))
                for (const o of mine) this.diag?.graphicApplied(o.label)
            } catch (e) {
                result.skipped.push(...mine.map((o) => ({ label: o.label, reason: message(e) })))
                for (const o of mine) this.diag?.graphicSkipped(o.label, message(e), e)
            }
        }
        for (let i = 0; i < packets.length;) {
            const r = replaced.get(i)
            if (!r) {
                result.items.push({ packet: packets[i], generated: false, splice: false })
                i++
                continue
            }
            for (const p of r.packets) result.items.push({ packet: p, generated: true, splice: false })
            if (r.span.resume === null) break
            const k = keyIdx[r.span.resume]
            result.items.push({ packet: packets[k], generated: false, splice: true })
            // The resumed key's leading pictures were re-encoded with the span.
            i = k + 1
            while (i < packets.length && packets[i].type !== 'key' && packets[i].timestamp < packets[k].timestamp) i++
        }
        return result
    }

    private async reencodeSpan(src: GraphicsSource, packets: EncodedPacket[], keyIdx: number[], span: ReencodeSpan, overlays: RenderOverlay[]): Promise<EncodedPacket[]> {
        if (typeof VideoDecoder === 'undefined') throw new Error('this browser cannot decode video')
        const first = keyIdx[span.decodeFrom]
        let end = packets.length
        if (span.resume !== null) {
            const k = keyIdx[span.resume]
            end = k + 1
            while (end < packets.length && packets[end].type !== 'key' && packets[end].timestamp < packets[k].timestamp) end++
        }
        // Leading pictures of the first fed key reference a GOP we do not feed: leave them out.
        const nextKey = keyIdx[span.decodeFrom + 1] ?? packets.length
        const feed = packets.slice(first, end).filter((p, i) => !(i > 0 && first + i < nextKey && p.timestamp < packets[first].timestamp))
        const eps = 1e-4
        const inSpan = (t: number): boolean => t >= span.outStart - eps && t < span.outEnd - eps
        const wanted = feed.filter((p) => inSpan(p.timestamp)).sort((a, b) => a.timestamp - b.timestamp)
        if (wanted.length === 0) throw new Error('no frames under the overlay')
        const keyTimes = new Set(keyIdx.map((k) => packets[k].timestamp).filter(inSpan))
        // Footage-like bitrate: the bytes being replaced over their duration, with some headroom.
        const bytes = packets.slice(keyIdx[span.from], end).reduce((a, p) => a + p.data.byteLength, 0)
        const fromBytes = Math.max(1e6, (bytes * 8 * 1.3) / Math.max(this.frameSec, span.outEnd - span.outStart))
        // Rescaled footage is smaller than its source: cap at what the output size needs.
        const bitrate = this.rescaled.has(src) ? Math.min(fromBytes, Math.max(8e6, (this.width * this.height) / (1920 * 1080) * 25e6)) : fromBytes
        const nearest = (us: number): EncodedPacket => {
            let best = wanted[0]
            for (const p of wanted) if (Math.abs(p.timestamp * 1e6 - us) < Math.abs(best.timestamp * 1e6 - us)) best = p
            return best
        }

        const queue: VideoFrame[] = []
        let decodeError: unknown = null
        const decoder = new VideoDecoder({ output: (f) => queue.push(f), error: (e) => { decodeError = e } })
        let canvas: OffscreenCanvas | null = null
        let ctx: OffscreenCanvasRenderingContext2D | null = null
        let encodedCount = 0
        const cache: OverlayCache = { words: null, prepared: null }
        try {
            decoder.configure(src.config)
            const { packets: encoded, description } = await encodeSegment(withBitrate(this.setup, bitrate), async (encode) => {
                const process = async (frame: VideoFrame): Promise<void> => {
                    const src0 = nearest(frame.timestamp)
                    if (Math.abs(src0.timestamp * 1e6 - frame.timestamp) > 2000 || !inSpan(src0.timestamp)) { frame.close(); return }
                    let out: VideoFrame
                    try {
                        out = await this.paintFrame(frame, src0.timestamp, overlays, cache, this.rescaled.has(src), () => {
                            if (!canvas) { canvas = new OffscreenCanvas(this.width, this.height); ctx = canvas.getContext('2d', { willReadFrequently: true }) }
                            if (!ctx) throw new Error('no 2D canvas')
                            return ctx
                        })
                    } finally {
                        frame.close()
                    }
                    await encode(out, encodedCount === 0 || keyTimes.has(src0.timestamp))
                    encodedCount++
                }
                for (const p of feed) {
                    if (decodeError) throw decodeError
                    decoder.decode(p.toEncodedVideoChunk())
                    while (queue.length) await process(queue.shift()!)
                    while (decoder.decodeQueueSize > 4 && !decodeError) { await tick(); while (queue.length) await process(queue.shift()!) }
                }
                await decoder.flush()
                while (queue.length) await process(queue.shift()!)
                if (decodeError) throw decodeError
            })
            if (encodedCount !== wanted.length || encoded.length !== wanted.length) throw new Error(`re-encoded ${encoded.length} of ${wanted.length} frames`)
            // Back onto the source's exact timestamps.
            const timed = encoded.map((p) => { const s = nearest(p.timestamp * 1e6); return p.clone({ timestamp: s.timestamp, duration: s.duration }) })
            return this.finish(timed, description, this.rescaled.has(src) ? this.setup.nalLength : src.nalLength, `overlay span: ${overlays.map((o) => o.label).filter(Boolean).join(', ') || 'rescale/crop'}`)
        } finally {
            for (const f of queue) f.close()
            if (decoder.state !== 'closed') decoder.close()
        }
    }

    private rasterCanvas: OffscreenCanvas | null = null

    /** Draws any decodable frame onto a canvas (optionally just a part of it, scaled up to the whole canvas) and returns its RGBA pixels. */
    private rasterise(frame: VideoFrame, width: number, height: number, crop?: RenderOverlay['crop'], cover = false): Uint8ClampedArray {
        if (!this.rasterCanvas || this.rasterCanvas.width !== width || this.rasterCanvas.height !== height) {
            this.rasterCanvas = new OffscreenCanvas(width, height)
        }
        const ctx = this.rasterCanvas.getContext('2d', crop || cover ? undefined : { willReadFrequently: true })
        if (!ctx) throw new Error('no 2D canvas to convert decoded frames')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        if (cover) {
            const v = frame.visibleRect!
            const { sx, sy, sw, sh } = coverRect(v.width, v.height, width, height, crop)
            ctx.drawImage(frame, v.x + sx, v.y + sy, sw, sh, 0, 0, width, height)
        } else if (crop) {
            const { sx, sy, sw, sh } = cropPixels(crop, width, height)
            ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, width, height)
        } else {
            ctx.drawImage(frame, 0, 0, width, height)
        }
        return ctx.getImageData(0, 0, width, height).data
    }

    /** Copies a decoded frame's planes, blends the active overlays in, and returns a new frame for the encoder. */
    private async paintFrame(frame: VideoFrame, t: number, overlays: RenderOverlay[], cache: OverlayCache, rescale: boolean, getCtx: () => OffscreenCanvasRenderingContext2D): Promise<VideoFrame> {
        const rect = frame.visibleRect!
        const W = rescale ? this.width : rect.width
        const H = rescale ? this.height : rect.height
        const cs = this.colorSpace
        let buf: Uint8Array
        let layout: PlaneLayout[]
        let format: 'I420' | 'NV12'
        const active = overlays.filter((o) => t >= o.startSec - 1e-6 && t < o.startSec + o.durationSec)
        // A replay crop replaces the picture first (rasterised through a canvas), anything drawn goes over it.
        const crop = active.find((o) => o.crop)?.crop
        if (isYuv420(frame.format) && !crop && !rescale) {
            format = frame.format
            buf = new Uint8Array(frame.allocationSize())
            layout = await frame.copyTo(buf)
        } else {
            // Some decoders (e.g. Android hardware, GPU-backed frames) hand back RGBA/BGRA or opaque frames:
            // rasterise through a canvas and convert to I420 in the footage's matrix and range.
            const rgba = this.rasterise(frame, W, H, crop, rescale)
            format = 'I420'
            buf = rgbaToI420(rgba, W, H, matrixOf(cs.matrix), cs.fullRange ?? false)
            layout = i420Layout(W, H)
        }
        const planes: YuvPlanes = { format, width: W, height: H, data: buf, planes: layout.map((l) => ({ offset: l.offset, stride: l.stride })) }
        // Decoders may hand back a different range than the footage is coded in (Chrome/VideoToolbox gives
        // limited-range NV12 for full-range HEVC): bring the samples back to the footage's range.
        // (Rasterised frames were converted straight into the footage's range above.)
        const decodedFull = frame.colorSpace.fullRange ?? false
        if (isYuv420(frame.format) && !crop && !rescale && decodedFull !== (cs.fullRange ?? false)) convertRange(planes, cs.fullRange ?? false)
        if (active.some((o) => o.rows(W, H)[1] > o.rows(W, H)[0])) {
            const ctx = getCtx()
            let y0 = H
            let y1 = 0
            for (const o of active) { const [a, b] = o.rows(W, H); y0 = Math.min(y0, a); y1 = Math.max(y1, b) }
            y0 = Math.max(0, Math.floor(y0))
            y1 = Math.min(H, Math.ceil(y1))
            if (y1 > y0) {
                ctx.clearRect(0, y0, W, y1 - y0)
                for (const o of active) { ctx.save(); o.paint(ctx, t - o.startSec); ctx.restore() }
                const img = ctx.getImageData(0, y0, W, y1 - y0)
                // Lower thirds hold still between their slide in and out: convert only when the pixels change.
                const words = new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.byteLength / 4)
                if (!cache.prepared || !cache.words || cache.prepared.y !== y0 || !sameWords(cache.words, words)) {
                    cache.prepared = prepareOverlay({ data: img.data, width: W, height: y1 - y0, x: 0, y: y0 }, matrixOf(cs.matrix), cs.fullRange ?? false)
                }
                cache.words = words
                applyOverlay(planes, cache.prepared)
            }
        }
        return new VideoFrame(buf, {
            format, codedWidth: W, codedHeight: H, timestamp: frame.timestamp, duration: frame.duration ?? undefined,
            layout, colorSpace: cs,
        })
    }
}

/** Sets up graphics for these sources, or throws with the reason they cannot be made. */
export async function openGraphicsSession(sources: GraphicsSource[], first: GraphicsSource, diag?: RenderDiagnostics): Promise<GraphicsSession> {
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
        throw new Error('this browser cannot encode video')
    }
    // Fonts must be ready before the first frame is painted (fail-safe: falls back, centred by measured metrics).
    await ensureGraphicsFonts()
    const hevc = first.video.codec === 'hevc'
    if (first.video.codec !== 'hevc' && first.video.codec !== 'avc') throw new Error(`${first.video.codec ?? 'this'} video is not supported`)
    const width = first.video.codedWidth
    const height = first.video.codedHeight
    const footageParams = new Map<GraphicsSource, Uint8Array[]>()
    const limits: SpsLimits[] = []
    const rescaled = new Set<GraphicsSource>()
    for (const s of sources) {
        if (!s.config.description) throw new Error('the video has no parameter sets in its sample entry')
        // Another frame size: its footage is re-encoded to the output size, so its parameter sets never reach the file.
        if (s.video.codedWidth !== width || s.video.codedHeight !== height) { rescaled.add(s); continue }
        if (s.nalLength !== first.nalLength) throw new Error('the clips use different NAL length sizes')
        const params = paramSets(s.config.description, hevc)
        const sps = spsOf(params, hevc)
        if (!sps) throw new Error('the video has no SPS')
        footageParams.set(s, params)
        limits.push(spsLimits(sps, hevc))
    }
    const stats = await first.video.computePacketStats(90)
    const frameSec = frameDuration(stats.averagePacketRate)
    const colorSpace = targetColorSpace(first.config.colorSpace)
    const cardBitrate = Math.max(2e6, Math.min(12e6, (width * height) / (1920 * 1080) * 10e6))
    let reason = 'no encoder for this video in this browser'
    for await (const setup of probeEncoders({ codec: first.config.codec, hevc, width, height, frameRate: 1 / frameSec, bitrate: cardBitrate, colorSpace }, diag && ((t) => diag.encoderTry(t)))) {
        if (setup.nalLength !== first.nalLength) { reason = 'the encoder uses a different NAL length size'; diag?.rejectLastEncoder(reason); continue }
        const all = [...limits, setup.limits]
        const idx = pickSampleEntry(all)
        if (idx === -1) { reason = 'the encoder and the footage need different decoder sizes'; diag?.rejectLastEncoder(reason); continue }
        const copied = sources.filter((s) => !rescaled.has(s))
        const base: VideoDecoderConfig = idx < copied.length
            ? copied[idx].config
            : { codec: setup.output.codec, description: setup.output.description, codedWidth: width, codedHeight: height, colorSpace }
        // The sample entry declares the highest level/tier of any SPS in the track (AVFoundation configures its decoder from it:
        // a card encoded at level 5.0 would otherwise hide level 6.0 footage).
        const entry = raiseEntry(base, hevc, all[idx], all)
        const entryLimits = raisedLimits(all[idx], all)
        if (!all.every((l) => covers(entryLimits, l))) { reason = 'no single decoder setup covers the encoder and the footage'; diag?.rejectLastEncoder(reason); continue }
        if (diag) {
            const copiedNames = copied.map((_, k) => `footage #${k}`)
            diag.cardCodec(setup.output.codec)
            diag.finalEncoder(setup.config)
            diag.sampleEntryDecision({
                candidates: all.map((l, k) => ({ from: k < copied.length ? copiedNames[k] : 'encoder', limits: l })),
                picked: idx, pickedFrom: idx < copied.length ? copiedNames[idx] : 'encoder',
                why: 'first SPS that covers every other in profile, coded size and reference frames',
                levelBefore: all[idx].level, levelAfter: entryLimits.level, tierBefore: all[idx].tier, tierAfter: entryLimits.tier,
                baseCodec: base.codec, entryCodec: entry.codec,
                baseHeader: describeParams(base.description, hevc), entryHeader: describeParams(entry.description, hevc),
            })
        }
        return new GraphicsSession({ hevc, entry, frameSec, width, height, colorSpace, setup, entryLimits, footageParams, rescaled, ...(diag ? { diag } : {}) })
    }
    throw new Error(reason)
}
