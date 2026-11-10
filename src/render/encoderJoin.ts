// Units of one re-encoded (journaled) render made by different H.264 encoders: hardware and software here, or parts
// prepared on another device. Handoff spike (2026-11-10, docs/superpowers/specs/2026-11-10-prepare-on-the-go-design.md):
// one avc1 sample entry = the unit SPS that covers all the others (profile, size, reference frames; level raised), every
// unit's own SPS/PPS in-band on its key frames. An entry with fewer reference frames than a later unit stops QuickTime
// there (-12137) while Chrome and ffmpeg play on; avc3 does not decode in AVFoundation. A High entry over in-band Main
// units decodes in AVFoundation; other profile mixes were not checked and are refused.
import { hasInbandParams } from './joinParams'
import { lengthSize, paramSets, raiseEntry, spsLimits, spsOf, withInbandParams, type SpsLimits } from './nal'

/** A unit's own sample description: the codec string and avcC record its encoder gave. */
export type UnitVideo = { codec: string; description: Uint8Array }

/** Colour of every re-encoded output (the encoders convert the canvas to BT.709 limited range but signal it differently in the VUI). */
export const OUTPUT_COLOR_SPACE: VideoColorSpaceInit = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }

const HIGH = 100
const MAIN = 77

/** An entry of H.264 profile `entry` decodes in-band units of profile `unit` in AVFoundation: same profile, or Main under High. */
export const avcProfileCovers = (entry: number, unit: number): boolean => entry === unit || (entry === HIGH && unit === MAIN)

/** `a` can be the sample entry for `b` (its level is raised afterwards): a covering profile, at least its coded size and reference frames. */
const entryCovers = (a: SpsLimits, b: SpsLimits): boolean =>
    avcProfileCovers(a.profile, b.profile) && a.codedWidth >= b.codedWidth && a.codedHeight >= b.codedHeight && a.dpb >= b.dpb

type Parsed = { video: UnitVideo; limits: SpsLimits; params: Uint8Array[]; ls: number }

function parse(video: UnitVideo): Parsed | null {
    try {
        const params = paramSets(video.description, false)
        const sps = spsOf(params, false)
        if (!sps || !params.some((n) => (n[0] & 31) === 8)) return null
        return { video, limits: spsLimits(sps, false), params, ls: lengthSize(video.description, false) }
    } catch { return null }
}

/** Same codec string and record bytes. */
export const sameVideo = (a: UnitVideo, b: UnitVideo): boolean =>
    a.codec === b.codec && a.description.length === b.description.length && a.description.every((x, i) => x === b.description[i])

/** The distinct descriptions among `videos`, in order of first use. */
const distinct = (videos: UnitVideo[]): UnitVideo[] => videos.filter((v, i) => videos.findIndex((w) => sameVideo(v, w)) === i)

/** Index (into `parsed`) of the entry that covers every one, or -1: unreadable, another NAL length size, or no covering SPS. */
function pickEntry(parsed: (Parsed | null)[]): number {
    if (parsed.some((p) => !p)) return -1
    const all = parsed as Parsed[]
    if (all.some((p) => p.ls !== all[0].ls)) return -1
    return all.findIndex((a) => all.every((b) => entryCovers(a.limits, b.limits)))
}

/**
 * Whether a cached unit made by another encoder may join a render that already holds `known` (its units so far and the
 * local encoder's description): one entry must still cover them all. Otherwise the unit is encoded here.
 */
export function admitsUnit(known: UnitVideo[], candidate: UnitVideo): boolean {
    if (known.some((k) => sameVideo(k, candidate))) return true
    return pickEntry(distinct([...known, candidate]).map(parse)) >= 0
}

export type EncoderJoin = {
    /** The MP4 sample entry. */
    entry: VideoDecoderConfig
    /** Per unit: the parameter sets to put in-band on its key frames (null = nothing: no video, or every unit has the same record). */
    inband: (Uint8Array[] | null)[]
    lengthSize: number
    /** More than one distinct description among the units. */
    mixed: boolean
}

/** The sample entry of a journaled render from its units' own descriptions (null = a unit without video). Throws when no entry covers them all. */
export function planEncoderJoin(units: (UnitVideo | null)[], codedWidth: number, codedHeight: number): EncoderJoin {
    const present = units.filter((u): u is UnitVideo => !!u)
    if (present.length === 0) throw new Error('the encoder produced no video')
    const kinds = distinct(present)
    const base = (v: UnitVideo): VideoDecoderConfig => ({ codec: v.codec, codedWidth, codedHeight, description: v.description, colorSpace: OUTPUT_COLOR_SPACE })
    if (kinds.length === 1) return { entry: base(present[0]), inband: units.map(() => null), lengthSize: lengthSize(present[0].description, false), mixed: false }
    const parsed = kinds.map(parse)
    const idx = pickEntry(parsed)
    if (idx < 0) throw new Error('units from different encoders cannot be joined into one file: discard the saved render and start again')
    const ok = parsed as Parsed[]
    const entry = raiseEntry(base(kinds[idx]), false, ok[idx].limits, ok.map((p) => p.limits))
    const paramsOf = (v: UnitVideo): Uint8Array[] => ok[kinds.findIndex((k) => sameVideo(k, v))].params
    return { entry, inband: units.map((u) => (u ? paramsOf(u) : null)), lengthSize: ok[idx].ls, mixed: true }
}

/** A video sample as it goes into the file: a key frame of a unit with in-band sets gets them (once); anything else is unchanged. */
export function joinedSample(data: Uint8Array, key: boolean, params: Uint8Array[] | null, ls: number): Uint8Array {
    if (!key || !params || hasInbandParams(data, false, ls)) return data
    return withInbandParams(data, params, false, ls)
}
