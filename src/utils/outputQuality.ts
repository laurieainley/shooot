// Full match output quality: Original (stream copy), 4K or 1080p (re-encoded H.264). Pure: option availability,
// size and time estimates. The numbers come from the encode benchmark (docs/superpowers/notes/2026-10-12-encode-benchmark.md).
import { LONG_SIDE, type OutputQuality, type ReencodeQuality } from '../render/transcodePlan'
import type { CodecSupport } from '../render/transcodeSupport'
import type { TimeEstimate } from './renderTime'

export type { OutputQuality, ReencodeQuality }

/** Default H.264 video bitrates (bits/s). */
export const VIDEO_BITRATE: Record<ReencodeQuality, number> = { '4k': 20_000_000, '1080p': 10_000_000 }
/** AAC bitrate when the audio has to be encoded (AAC sources are copied). */
export const AUDIO_BITRATE = 160_000
/** Typical copied-audio rate (GoPro / phones are ~190 kbps AAC), for size estimates. */
const COPIED_AUDIO_BITRATE = 192_000

/**
 * Fallback re-encode time as a range of multiples of the match length, for when nothing is known about the footage or the
 * plan (the real estimate is utils/renderTime, which prices what the render actually does). From real-device runs on raw
 * GoPro 4K (wall ÷ output length): 4K 0.85× (Mac) to 1.25× (Pixel), 1080p 0.68× (Mac) to 1.02× (Pixel).
 */
export const ENCODE_TIME_RANGE: Record<ReencodeQuality, [number, number]> = { '4k': [0.8, 1.3], '1080p': [0.65, 1.1] }

/** The Highlights choice as saved: 'auto' = the device's default until the user picks something. */
export type HighlightsQualityChoice = 'auto' | OutputQuality

/** What 'auto' means: Original on a desktop or tablet, 1080p on a phone (where Original is the slowest). An explicit choice always wins. */
export function resolveHighlightsQuality(choice: HighlightsQualityChoice | undefined, phone: boolean): OutputQuality {
    if (choice && choice !== 'auto') return choice
    return phone ? '1080p' : 'original'
}

export const QUALITY_LABEL: Record<OutputQuality, string> = { original: 'Original', '4k': '4K', '1080p': '1080p' }

/** The footage's size, and (once the file has been read) its codec and frame rate, for the time estimate. */
export type SourceInfo = { width: number; height: number; codec?: 'h264' | 'hevc'; fps?: number }

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
    /** Roughly how long it takes as a range of multiples of the match length; null when unknown. */
    timeRange: [number, number] | null
    /** 'this device' when the range comes from renders measured here (narrower); else typical for the device class. */
    timeBasis?: 'typical' | 'this device'
    /** Disabled because the browser's storage for this site is too small for the file (not because of the footage or codec). */
    noRoom?: boolean
}

/** The three choices for this footage and browser. `originalBytes` is the stream-copy estimate. */
export function qualityOptions(o: { source: SourceInfo | null; support: CodecSupport; seconds: number; originalBytes: number; /** How long each choice takes for this plan (utils/exportPlans estimatePlanTime); omitted = the fixed fallback ranges. */ time?: (q: OutputQuality) => TimeEstimate | null }): QualityOption[] {
    const long = o.source ? Math.max(o.source.width, o.source.height) : 0
    const reasonFor = (q: ReencodeQuality): string | null => {
        if (!o.source) return 'Load the match videos first.'
        if (q === '4k' && long < LONG_SIDE['4k'] - 16) return `The footage is ${o.source.width}×${o.source.height}, not 4K.`
        if (o.support.decode === false) return 'This browser cannot decode the footage’s video format, so it can only be copied (Original).'
        if (o.support.encode[q] === false) return `This browser cannot encode ${q === '4k' ? '4K' : '1080p'} H.264.`
        return null
    }
    const timed = (q: OutputQuality): Pick<QualityOption, 'timeRange' | 'timeBasis'> => {
        const e = o.time?.(q)
        if (!e || !(o.seconds > 0)) return { timeRange: q === 'original' ? null : ENCODE_TIME_RANGE[q] }
        return { timeRange: [e.low / o.seconds, e.high / o.seconds], timeBasis: e.basis }
    }
    const re = (q: ReencodeQuality): QualityOption => {
        const reason = reasonFor(q)
        return { id: q, label: QUALITY_LABEL[q], disabled: reason !== null, reason, bytes: estimateEncodedBytes(q, o.seconds), ...timed(q) }
    }
    return [
        { id: 'original', label: 'Original', disabled: false, reason: null, bytes: o.originalBytes, ...timed('original') },
        re('4k'),
        re('1080p'),
    ]
}

const minutes = (sec: number): number => {
    const m = sec / 60
    return m >= 15 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m))
}

/** "roughly 30–60 min for a 49 min match, depending on the device" / "quickest" for a stream copy. `noun` names what the length is of (match, reel). */
export function timeHint(range: [number, number] | null, seconds: number, noun = 'match', basis: 'typical' | 'this device' = 'typical'): string {
    if (range === null) return 'quickest'
    if (seconds < 60) return 'under a minute'
    const lo = minutes(seconds * range[0])
    const hi = Math.max(lo, minutes(seconds * range[1]))
    const span = lo === hi ? `${lo} min` : `${lo}–${hi} min`
    return `roughly ${span} for a ${Math.round(seconds / 60)} min ${noun}${basis === 'this device' ? ', going by your last renders' : ', depending on the device'}`
}

// ---- Storage fit ----

/** Spare room kept free: estimates are rough and the browser may count usage differently. */
export const FIT_MARGIN = 1.1
/** Below this the site's quota is a private/incognito window's. */
export const PRIVATE_QUOTA = 2e9

const gb = (bytes: number): string => bytes < 1e9 ? `${Math.max(1, Math.round(bytes / 1e6))} MB` : `${(bytes / 1e9).toFixed(bytes >= 1e11 ? 0 : 1)} GB`

export type FitResult = {
    options: QualityOption[]
    /** The option to use: the chosen one if it fits, else the largest that does. */
    effective: OutputQuality
    /** Said when `effective` is not what was chosen, or nothing fits. */
    note: string | null
    privateHint: boolean
}

/**
 * Greys out the options that will not fit in the browser's storage (`room.free`, with a margin) and picks the one to use.
 * `room` null (the browser would not say) blocks nothing. When nothing fits, nothing is greyed out (there would be no
 * choice left) and the note warns instead. `chosen` is the saved choice.
 */
export function applyStorageFit(options: QualityOption[], room: { quota: number; free: number } | null, chosen: OutputQuality): FitResult {
    const usable = (o: QualityOption) => !o.disabled
    const fallback = (): OutputQuality => {
        const c = options.find((o) => o.id === chosen)
        return c && usable(c) ? c.id : 'original'
    }
    if (!room) return { options, effective: fallback(), note: null, privateHint: false }
    const privateHint = room.quota < PRIVATE_QUOTA
    const fits = (o: QualityOption) => o.bytes * FIT_MARGIN <= room.free
    const candidates = options.filter(usable)
    if (!candidates.some(fits)) {
        const eff = fallback()
        const need = options.find((o) => o.id === eff)?.bytes ?? 0
        return { options, effective: eff, privateHint, note: `This may not fit in this browser’s storage (about ${gb(need)} needed, ${gb(room.free)} available). The render could stop part way.` }
    }
    const marked = options.map((o): QualityOption => usable(o) && !fits(o)
        ? { ...o, disabled: true, noRoom: true, reason: `Too big for this browser’s storage (about ${gb(o.bytes)} needed, ${gb(room.free)} available)` }
        : o)
    const c = marked.find((o) => o.id === chosen)
    if (c && usable(c)) return { options: marked, effective: c.id, note: null, privateHint }
    const wasChosen = options.find((o) => o.id === chosen)
    // Only talk about the switch when the choice was lost to storage (not to the footage or the browser).
    const lostToRoom = !!wasChosen && usable(wasChosen) && !fits(wasChosen)
    const original = marked.find((o) => o.id === 'original')!
    const pick = !lostToRoom && usable(original) ? original : marked.filter(usable).sort((a, b) => b.bytes - a.bytes)[0]!
    return { options: marked, effective: pick.id, privateHint, note: lostToRoom ? `${QUALITY_LABEL[chosen]} would not fit in this browser’s storage, so ${QUALITY_LABEL[pick.id]} is selected.` : null }
}

/**
 * The quality "Save to file…" uses. It needs no browser storage, so the chosen quality stands even when it was greyed out as too big
 * for storage (`noRoom`); any other problem (footage, codec) still falls back to `effective`.
 */
export function saveToFileQuality(options: QualityOption[], chosen: OutputQuality, effective: OutputQuality): OutputQuality {
    const c = options.find((o) => o.id === chosen)
    return c?.noRoom ? c.id : effective
}
