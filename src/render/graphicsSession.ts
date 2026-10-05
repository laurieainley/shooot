// Generated video spliced into stream-copied footage (cards and overlays), following the spike's three rules:
// parameter sets in-band on every key frame, a sample entry whose SPS covers every other SPS in the track,
// and generated frames tagged with the footage colour space.
import { EncodedPacket, type InputVideoTrack } from 'mediabunny'
import { frameDuration, presentationRanks } from './frameGrid'
import { covers, craToBla, paramSets, pickSampleEntry, spsLimits, spsOf, withInbandParams, type SpsLimits } from './nal'
import { overlaySpans, type Gop, type ReencodeSpan } from './overlayWindow'
import { describeOutput, encodeSegment, probeEncoders, rgbaFrame, withBitrate, type EncoderSetup } from './segmentEncoder'
import { blendRgba, matrixOf, type YuvPlanes } from './yuvBlend'
import type { RenderCard, RenderOverlay } from './types'

export type GraphicsSource = { video: InputVideoTrack; config: VideoDecoderConfig; nalLength: number }

/** A packet for the output track. `splice`: a footage key the copy resumes at (leading pictures dropped). */
export type OutItem = { packet: EncodedPacket; generated: boolean; splice: boolean }

export type OverlayResult = { items: OutItem[]; applied: string[]; skipped: { label: string; reason: string }[] }

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export class GraphicsSession {
    readonly hevc: boolean
    /** Decoder config for the MP4 sample entry. */
    readonly entry: VideoDecoderConfig
    readonly frameSec: number
    private readonly width: number
    private readonly height: number
    private readonly colorSpace: VideoColorSpaceInit | undefined
    private readonly setup: EncoderSetup
    private readonly entryLimits: SpsLimits
    private readonly footageParams: Map<GraphicsSource, Uint8Array[]>

    constructor(o: {
        hevc: boolean; entry: VideoDecoderConfig; frameSec: number; width: number; height: number
        colorSpace: VideoColorSpaceInit | undefined; setup: EncoderSetup; entryLimits: SpsLimits; footageParams: Map<GraphicsSource, Uint8Array[]>
    }) {
        this.hevc = o.hevc
        this.entry = o.entry
        this.frameSec = o.frameSec
        this.width = o.width
        this.height = o.height
        this.colorSpace = o.colorSpace
        this.setup = o.setup
        this.entryLimits = o.entryLimits
        this.footageParams = o.footageParams
    }

    /** A copied footage key frame with its own parameter sets in-band (and BLA when it is a splice point). */
    footageKey(src: GraphicsSource, data: Uint8Array, splice: boolean): Uint8Array {
        const params = this.footageParams.get(src)
        const withParams = params ? withInbandParams(data, params, this.hevc, src.nalLength) : data
        return splice && this.hevc ? craToBla(withParams, src.nalLength) ?? withParams : withParams
    }

    /** Checks an encoded run against the sample entry and puts its parameter sets on its key frames. */
    private finish(packets: EncodedPacket[], description: Uint8Array | null, nalLength: number): EncodedPacket[] {
        if (!description) throw new Error('the encoder gave no parameter sets')
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
        const { packets, description } = await encodeSegment(this.setup.config, async (encode) => {
            for (let i = 0; i < n; i++) {
                ctx.save()
                ctx.clearRect(0, 0, W, H)
                card.paint(ctx, i * frameSec)
                ctx.restore()
                await encode(rgbaFrame(ctx, W, H, Math.round(i * frameSec * 1e6), durUs, this.colorSpace), i % keyEvery === 0)
                onFrame?.((i + 1) / n)
            }
        })
        if (packets.length !== n) throw new Error(`the encoder returned ${packets.length} of ${n} frames`)
        const ranks = presentationRanks(packets.map((p) => p.timestamp))
        const timed = packets.map((p, i) => p.clone({ timestamp: ranks[i] * frameSec, duration: frameSec }))
        return this.finish(timed, description, this.setup.nalLength)
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
            } catch (e) {
                result.skipped.push(...mine.map((o) => ({ label: o.label, reason: message(e) })))
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
        const bitrate = Math.max(1e6, (bytes * 8 * 1.3) / Math.max(this.frameSec, span.outEnd - span.outStart))
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
        try {
            decoder.configure(src.config)
            const { packets: encoded, description } = await encodeSegment(withBitrate(this.setup, bitrate), async (encode) => {
                const process = async (frame: VideoFrame): Promise<void> => {
                    const src0 = nearest(frame.timestamp)
                    if (Math.abs(src0.timestamp * 1e6 - frame.timestamp) > 2000 || !inSpan(src0.timestamp)) { frame.close(); return }
                    let out: VideoFrame
                    try {
                        out = await this.paintFrame(frame, src0.timestamp, overlays, () => {
                            if (!canvas) { canvas = new OffscreenCanvas(frame.visibleRect!.width, frame.visibleRect!.height); ctx = canvas.getContext('2d', { willReadFrequently: true }) }
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
            return this.finish(timed, description, src.nalLength)
        } finally {
            for (const f of queue) f.close()
            if (decoder.state !== 'closed') decoder.close()
        }
    }

    /** Copies a decoded frame's planes, blends the active overlays in, and returns a new frame for the encoder. */
    private async paintFrame(frame: VideoFrame, t: number, overlays: RenderOverlay[], getCtx: () => OffscreenCanvasRenderingContext2D): Promise<VideoFrame> {
        const format = frame.format
        if (format !== 'I420' && format !== 'NV12') throw new Error(`unsupported decoded format ${format ?? 'unknown'}`)
        const rect = frame.visibleRect!
        const buf = new Uint8Array(frame.allocationSize())
        const layout = await frame.copyTo(buf)
        const W = rect.width
        const H = rect.height
        const cs = this.colorSpace ?? frame.colorSpace.toJSON()
        const active = overlays.filter((o) => t >= o.startSec - 1e-6 && t < o.startSec + o.durationSec)
        if (active.length > 0) {
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
                const planes: YuvPlanes = { format, width: W, height: H, data: buf, planes: layout.map((l) => ({ offset: l.offset, stride: l.stride })) }
                blendRgba(planes, { data: img.data, width: W, height: y1 - y0, x: 0, y: y0 }, matrixOf(cs.matrix), cs.fullRange ?? false)
            }
        }
        return new VideoFrame(buf, {
            format, codedWidth: W, codedHeight: H, timestamp: frame.timestamp, duration: frame.duration ?? undefined,
            layout, colorSpace: cs,
        })
    }
}

/** Sets up graphics for these sources, or throws with the reason they cannot be made. */
export async function openGraphicsSession(sources: GraphicsSource[], first: GraphicsSource): Promise<GraphicsSession> {
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
        throw new Error('this browser cannot encode video')
    }
    const hevc = first.video.codec === 'hevc'
    if (first.video.codec !== 'hevc' && first.video.codec !== 'avc') throw new Error(`${first.video.codec ?? 'this'} video is not supported`)
    const width = first.video.codedWidth
    const height = first.video.codedHeight
    const footageParams = new Map<GraphicsSource, Uint8Array[]>()
    const limits: SpsLimits[] = []
    for (const s of sources) {
        if (!s.config.description) throw new Error('the video has no parameter sets in its sample entry')
        if (s.video.codedWidth !== width || s.video.codedHeight !== height) throw new Error('the clips have different frame sizes')
        if (s.nalLength !== first.nalLength) throw new Error('the clips use different NAL length sizes')
        const params = paramSets(s.config.description, hevc)
        const sps = spsOf(params, hevc)
        if (!sps) throw new Error('the video has no SPS')
        footageParams.set(s, params)
        limits.push(spsLimits(sps, hevc))
    }
    const stats = await first.video.computePacketStats(90)
    const frameSec = frameDuration(stats.averagePacketRate)
    const colorSpace = first.config.colorSpace
    const cardBitrate = Math.max(2e6, Math.min(12e6, (width * height) / (1920 * 1080) * 10e6))
    let reason = 'no encoder for this video in this browser'
    for await (const setup of probeEncoders({ codec: first.config.codec, hevc, width, height, frameRate: 1 / frameSec, bitrate: cardBitrate, colorSpace })) {
        if (setup.nalLength !== first.nalLength) { reason = 'the encoder uses a different NAL length size'; continue }
        const all = [...limits, setup.limits]
        const idx = pickSampleEntry(all)
        if (idx === -1) { reason = 'the encoder and the footage need different decoder sizes'; continue }
        const entry: VideoDecoderConfig = idx < sources.length
            ? sources[idx].config
            : { codec: setup.output.codec, description: setup.output.description, codedWidth: width, codedHeight: height, ...(colorSpace ? { colorSpace } : {}) }
        return new GraphicsSession({ hevc, entry, frameSec, width, height, colorSpace, setup, entryLimits: all[idx], footageParams })
    }
    throw new Error(reason)
}
