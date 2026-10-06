// Joining several source files into one track: each file has its own VPS/SPS/PPS. A decoder that only sees the first
// file's parameter sets (the MP4 sample entry) mis-decodes the rest, so every key frame carries its own source's sets
// in-band and the sample entry holds the SPS that covers all of them (the title-card spike's rules).
import { covers, nalType, paramSets, pickSampleEntry, raiseEntry, spsLimits, spsOf, type SpsLimits } from './nal'

export type JoinPlan = {
    /** Index of the source whose record becomes the sample entry. */
    entry: number
    /** Each source's own VPS/SPS/PPS. */
    params: Uint8Array[][]
    limits: SpsLimits[]
}

/** Parameter sets per source and the covering sample entry, or null when any source's sets cannot be read. */
export function planJoin(descriptions: (AllowSharedBufferSource | undefined)[], hevc: boolean): JoinPlan | null {
    const params: Uint8Array[][] = []
    const limits: SpsLimits[] = []
    for (const d of descriptions) {
        if (!d) return null
        const p = paramSets(d, hevc)
        const sps = spsOf(p, hevc)
        if (!sps) return null
        params.push(p)
        limits.push(spsLimits(sps, hevc))
    }
    if (params.length === 0) return null
    const idx = pickSampleEntry(limits)
    // No single SPS covers the rest: take the largest, a best effort that is still no worse than the first file's.
    const entry = idx >= 0 ? idx : limits.reduce((best, l, i) => (covers(l, limits[best]) ? i : best), 0)
    return { entry, params, limits }
}

/** The sample entry config of a join: the entry source's record with its level raised to the highest among the sources. */
export function joinEntryConfig(plan: JoinPlan, config: VideoDecoderConfig, hevc: boolean): VideoDecoderConfig {
    return raiseEntry(config, hevc, plan.limits[plan.entry], plan.limits)
}

/** True when the sample already carries VPS/SPS/PPS (then nothing is added). */
export function hasInbandParams(data: Uint8Array, hevc: boolean, ls: number): boolean {
    const types = hevc ? [32, 33, 34] : [7, 8]
    for (let o = 0; o + ls < data.length;) {
        let len = 0
        for (let i = 0; i < ls; i++) len = len * 256 + data[o + i]
        if (types.includes(nalType(data.subarray(o + ls), hevc))) return true
        o += ls + len
    }
    return false
}

/** Profile part of a WebCodecs codec string: HEVC `hvc1.2.4.L120.B0` -> "2", H.264 `avc1.640028` -> "64". */
export function profileOf(codec: string): string {
    const parts = codec.split('.')
    if (parts.length < 2) return ''
    return /^(hvc1|hev1)$/.test(parts[0]) ? parts[1].replace(/^[A-C]/, '') : parts[1].slice(0, 2).toLowerCase()
}
