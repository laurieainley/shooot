// What this browser can do for the re-encoding export: decode the footage's codec, encode H.264 at the output size.
// Uses WebCodecs isConfigSupported only (nothing is encoded), so it is cheap enough to run when a panel opens.
import type { ReencodeQuality } from './transcodePlan'
import { outputDimensions } from './transcodePlan'

export type H264Encoder = { config: VideoEncoderConfig; hardware: 'prefer-hardware' | 'no-preference' | 'prefer-software' }

/** H.264 High profile level strings to try for a picture size, lowest sufficient level first. */
export function avcCodecCandidates(width: number, height: number, fps: number): string[] {
    const mbps = Math.ceil(width / 16) * Math.ceil(height / 16) * fps
    if (mbps <= 245760 && width * height <= 2097152) return ['avc1.64002a', 'avc1.640028', 'avc1.640032'] // 4.2 (1080p60), 4.0, 5.0
    if (mbps <= 983040) return ['avc1.640033', 'avc1.640034', 'avc1.640032'] // 5.1 (4K30), 5.2
    return ['avc1.640034', 'avc1.640033']
}

/** The first H.264 encoder configuration the browser supports at this size, hardware preferred; null when none. */
export async function pickH264Encoder(width: number, height: number, bitrate: number, fps: number, prefer: H264Encoder['hardware'][] = ['prefer-hardware', 'no-preference']): Promise<H264Encoder | null> {
    if (typeof VideoEncoder === 'undefined') return null
    for (const hardware of prefer) {
        for (const codec of avcCodecCandidates(width, height, fps)) {
            const config = {
                codec, width, height, bitrate: Math.round(bitrate), framerate: fps, bitrateMode: 'variable', latencyMode: 'quality',
                hardwareAcceleration: hardware, avc: { format: 'avc' },
            } as VideoEncoderConfig
            const r = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }))
            if (r.supported) return { config, hardware }
        }
    }
    return null
}

export type CodecSupport = {
    /** The footage's codec can be decoded here (null = not checked yet). */
    decode: boolean | null
    /** H.264 can be encoded at the 4K / 1080p output size (null = not checked yet). */
    encode: Record<ReencodeQuality, boolean | null>
}

export const UNKNOWN_SUPPORT: CodecSupport = { decode: null, encode: { '4k': null, '1080p': null } }

/** Checks decode support of the source and encode support of both output sizes. Never throws. */
export async function probeSupport(source: { codec: string | null; description?: AllowSharedBufferSource; width: number; height: number }): Promise<CodecSupport> {
    let decode = false
    try {
        if (typeof VideoDecoder !== 'undefined' && source.codec) {
            const r = await VideoDecoder.isConfigSupported({ codec: source.codec, codedWidth: source.width, codedHeight: source.height, ...(source.description ? { description: source.description } : {}) })
            decode = !!r.supported
        }
    } catch { decode = false }
    const encode = async (q: ReencodeQuality): Promise<boolean> => {
        const { width, height } = outputDimensions(q, source.width, source.height)
        return !!(await pickH264Encoder(width, height, 10e6, 30))
    }
    return { decode, encode: { '4k': await encode('4k'), '1080p': await encode('1080p') } }
}
