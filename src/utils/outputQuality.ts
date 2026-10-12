// Full match output quality: Original (stream copy), 4K or 1080p (re-encoded H.264). Pure: option availability,
// size and time estimates. The numbers come from the encode benchmark (docs/superpowers/notes/2026-10-12-encode-benchmark.md).
import { LONG_SIDE, type OutputQuality, type ReencodeQuality } from '../render/transcodePlan'
import type { CodecSupport } from '../render/transcodeSupport'

export type { OutputQuality, ReencodeQuality }

/** Default H.264 video bitrates (bits/s). */
export const VIDEO_BITRATE: Record<ReencodeQuality, number> = { '4k': 20_000_000, '1080p': 10_000_000 }
/** AAC bitrate when the audio has to be encoded (AAC sources are copied). */
export const AUDIO_BITRATE = 160_000
/** Typical copied-audio rate (GoPro / phones are ~190 kbps AAC), for size estimates. */
const COPIED_AUDIO_BITRATE = 192_000

/** Re-encode time as a multiple of the match length (measured with hardware encoding, see the benchmark note). */
export const ENCODE_TIME_FACTOR: Record<ReencodeQuality, number> = { '4k': 1.0, '1080p': 0.6 }

export const QUALITY_LABEL: Record<OutputQuality, string> = { original: 'Original', '4k': '4K', '1080p': '1080p' }

export type SourceInfo = { width: number; height: number }

/** Estimated size of a re-encoded export of `seconds` of output. */
export function estimateEncodedBytes(quality: ReencodeQuality, seconds: number, bitrate: number = VIDEO_BITRATE[quality]): number {
    return Math.round(((bitrate + COPIED_AUDIO_BITRATE) / 8) * Math.max(0, seconds))
}

export type QualityOption = {
    id: OutputQuality
    label: string
    disabled: boolean
    /** Why it is disabled (or a note when it is checked still). */
    reason: string | null
    bytes: number
    /** Roughly how long it takes as a multiple of the match length; null for a stream copy. */
    timeFactor: number | null
}

/** The three choices for this footage and browser. `originalBytes` is the stream-copy estimate. */
export function qualityOptions(o: { source: SourceInfo | null; support: CodecSupport; seconds: number; originalBytes: number }): QualityOption[] {
    const long = o.source ? Math.max(o.source.width, o.source.height) : 0
    const reasonFor = (q: ReencodeQuality): string | null => {
        if (!o.source) return 'Load the match videos first.'
        if (q === '4k' && long < LONG_SIDE['4k'] - 16) return `The footage is ${o.source.width}×${o.source.height}, not 4K.`
        if (o.support.decode === false) return 'This browser cannot decode the footage’s video format, so it can only be copied (Original).'
        if (o.support.encode[q] === false) return `This browser cannot encode ${q === '4k' ? '4K' : '1080p'} H.264.`
        return null
    }
    const re = (q: ReencodeQuality): QualityOption => {
        const reason = reasonFor(q)
        return { id: q, label: QUALITY_LABEL[q], disabled: reason !== null, reason, bytes: estimateEncodedBytes(q, o.seconds), timeFactor: ENCODE_TIME_FACTOR[q] }
    }
    return [
        { id: 'original', label: 'Original', disabled: false, reason: null, bytes: o.originalBytes, timeFactor: null },
        re('4k'),
        re('1080p'),
    ]
}

/** "about 1× the match length" / "under a minute for a short match". */
export function timeHint(factor: number | null): string {
    if (factor === null) return 'quickest'
    const rounded = Math.max(0.25, Math.round(factor * 4) / 4)
    return `about ${rounded === 1 ? '1' : String(rounded)}× the match length`
}
