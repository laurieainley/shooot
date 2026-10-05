// WebCodecs encoding of generated video (cards, frames with overlays) that will be spliced into stream-copied
// footage. See the title-card spike for why the codec string, colour space and parameter sets matter.
import { EncodedPacket } from 'mediabunny'
import { lengthSize, paramSets, spsLimits, spsOf, type SpsLimits } from './nal'

export type EncoderSetup = {
    config: VideoEncoderConfig
    /** Parameter sets this encoder produces, its SPS limits and NAL length size. */
    params: Uint8Array[]
    limits: SpsLimits
    nalLength: number
}

export type EncoderTarget = { codec: string; hevc: boolean; width: number; height: number; frameRate: number; bitrate: number }

const FALLBACKS = {
    hevc: ['hvc1.1.6.L123.B0', 'hvc1.1.6.L150.B0', 'hvc1.1.6.L153.B0', 'hvc1.1.6.L120.B0'],
    avc: ['avc1.640028', 'avc1.640033', 'avc1.4d0028', 'avc1.42e028'],
}

/** Codec strings to try: the footage's own (same profile/level), then common ones. */
export function encoderCandidates(footageCodec: string, hevc: boolean): string[] {
    return [...new Set([footageCodec, ...(hevc ? FALLBACKS.hevc : FALLBACKS.avc)])]
}

function encoderConfig(t: EncoderTarget, codec: string, latencyMode: LatencyMode, bitrate = t.bitrate): VideoEncoderConfig {
    return {
        codec, width: t.width, height: t.height, framerate: t.frameRate, bitrate, latencyMode,
        ...(t.hevc ? { hevc: { format: 'hevc' } } : { avc: { format: 'avc' } }),
    } as VideoEncoderConfig
}

type Encoded = { packets: EncodedPacket[]; description: Uint8Array | null }

/** Runs one encoder session; `produce` feeds frames (which are closed after encoding). Packets keep µs-based timestamps. */
export async function encodeSegment(
    config: VideoEncoderConfig,
    produce: (encode: (frame: VideoFrame, keyFrame: boolean) => Promise<void>) => Promise<void>,
): Promise<Encoded> {
    const packets: EncodedPacket[] = []
    let description: Uint8Array | null = null
    let failure: unknown = null
    const enc = new VideoEncoder({
        output: (chunk, meta) => {
            const data = new Uint8Array(chunk.byteLength)
            chunk.copyTo(data)
            packets.push(new EncodedPacket(data, chunk.type, chunk.timestamp / 1e6, (chunk.duration ?? 0) / 1e6))
            const d = meta?.decoderConfig?.description
            if (d && !description) description = d instanceof Uint8Array ? d.slice() : new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0))
        },
        error: (e) => { failure = e },
    })
    try {
        enc.configure(config)
        await produce(async (frame, keyFrame) => {
            if (failure) { frame.close(); throw failure }
            try { enc.encode(frame, { keyFrame }) } finally { frame.close() }
            while (enc.encodeQueueSize > 4 && !failure) await new Promise((r) => setTimeout(r, 1))
        })
        await enc.flush()
    } finally {
        if (enc.state !== 'closed') enc.close()
    }
    if (failure) throw failure instanceof Error ? failure : new Error(String(failure))
    return { packets, description }
}

export function describeOutput(description: Uint8Array, hevc: boolean): Pick<EncoderSetup, 'params' | 'limits' | 'nalLength'> {
    const params = paramSets(description, hevc)
    const sps = spsOf(params, hevc)
    if (!sps) throw new Error('Encoder gave no SPS')
    return { params, limits: spsLimits(sps, hevc), nalLength: lengthSize(description, hevc) }
}

/**
 * Working encoder configurations for the footage, in order of preference (footage codec string first;
 * 'quality' then 'realtime' latency, which can change the reference count). Each is checked by encoding one
 * frame, which also tells us the parameter sets it will produce.
 */
export async function* probeEncoders(t: EncoderTarget): AsyncGenerator<EncoderSetup> {
    if (typeof globalThis.VideoEncoder === 'undefined' || typeof globalThis.OffscreenCanvas === 'undefined') return
    for (const codec of encoderCandidates(t.codec, t.hevc)) {
        for (const latencyMode of ['quality', 'realtime'] as LatencyMode[]) {
            const config = encoderConfig(t, codec, latencyMode)
            const support = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }))
            if (!support.supported) continue
            try {
                const canvas = new OffscreenCanvas(t.width, t.height)
                const ctx = canvas.getContext('2d')!
                ctx.fillRect(0, 0, t.width, t.height)
                const { description } = await encodeSegment(config, async (encode) => {
                    await encode(new VideoFrame(canvas, { timestamp: 0, duration: Math.round(1e6 / t.frameRate) }), true)
                })
                if (!description) continue
                yield { config, ...describeOutput(description, t.hevc) }
            } catch {
                continue
            }
        }
    }
}

/** Same settings at a different bitrate (overlay GOPs follow the footage's bitrate). */
export function withBitrate(setup: EncoderSetup, bitrate: number): VideoEncoderConfig {
    return { ...setup.config, bitrate: Math.round(bitrate) }
}
