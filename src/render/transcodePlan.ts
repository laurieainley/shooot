// Pure planning for the re-encoding export (Full match "4K" / "1080p"): the output frame grid, the size and the
// work units (segments of a cut) that a resumable render saves after. No browser APIs.
import { frameDuration } from './frameGrid'

export type OutputQuality = 'original' | '4k' | '1080p'
export type ReencodeQuality = Exclude<OutputQuality, 'original'>

/** Long side of the output picture for each re-encoding quality. */
export const LONG_SIDE: Record<ReencodeQuality, number> = { '4k': 3840, '1080p': 1920 }

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)

/** The output size: the source's display size scaled so its long side is the quality's (even sides, aspect kept). */
export function outputDimensions(quality: ReencodeQuality, srcWidth: number, srcHeight: number): { width: number; height: number } {
    const k = LONG_SIDE[quality] / Math.max(srcWidth, srcHeight)
    return { width: even(srcWidth * k), height: even(srcHeight * k) }
}

/** Constant output frame duration: the footage's usual rate snapped to a standard one; 50/60 fps footage is halved; unknown = 30 fps. */
export function outputFrameSec(nominalFps: number): number {
    if (!Number.isFinite(nominalFps) || nominalFps < 10) return 1 / 30
    return frameDuration(nominalFps > 31 ? nominalFps / 2 : nominalFps)
}

/** Frames between key frames (about `intervalSec`). */
export function keyEvery(frameSec: number, intervalSec = 2): number {
    return Math.max(1, Math.round(intervalSec / frameSec))
}

export type PlanCut = { startSec: number; endSec: number; speed?: number }

/** Output frames of a cut on the constant grid (a slowed cut lasts 1/speed as long). Always at least one. */
export function cutFrames(c: PlanCut, frameSec: number): number {
    return Math.max(1, Math.round((c.endSec - c.startSec) / (c.speed ?? 1) / frameSec))
}

/** Units (segments) a journaled re-encode runs at the same time: 2 on every device class (iPad files grow ~18% at 2 and ~36% at 3; Pixel gains little from 3). */
export const PARALLEL_UNITS = 2
/** Shortest piece of output worth a unit of its own when splitting a render to have something to run in parallel (each unit starts with a key frame). */
export const MIN_PARALLEL_UNIT_SEC = 10

/**
 * A resumable stretch of a cut: output frames `firstFrame` … `firstFrame + frames - 1` of cut `cutIndex`.
 * `grid` (blocks, see gridSegments): the absolute source frame number of its first frame, i.e. it shows the source pictures at
 * `grid × frameSec` onwards whatever the cut's own start; absent = the stretch is timed from the cut's start.
 */
export type Segment = { cutIndex: number; firstFrame: number; frames: number; grid?: number }

/**
 * Splits every cut into segments of at most `maxFrames` output frames (a render saves progress after each).
 * `balance`: cut the pieces of a cut to equal length instead of leaving a short tail, and, when the whole render would have
 * fewer than `units` segments, split the longest ones further (never below `minFrames` each) so that many can run side by side.
 */
export function planSegments(cuts: PlanCut[], frameSec: number, maxFrames: number, balance?: { units: number; minFrames: number; stable?: boolean }): Segment[] {
    const totals = cuts.map((c) => cutFrames(c, frameSec))
    if (balance?.stable) {
        const fixed = stableSegments(totals, maxFrames, balance.minFrames)
        if (fixed.length >= balance.units) return fixed
    }
    const counts = totals.map((t) => Math.max(1, Math.ceil(t / maxFrames)))
    if (balance) {
        for (;;) {
            if (counts.reduce((a, n) => a + n, 0) >= balance.units) break
            let best = -1
            let longest = 0
            totals.forEach((t, i) => { const len = t / counts[i]; if (len > longest && t / (counts[i] + 1) >= balance.minFrames) { longest = len; best = i } })
            if (best < 0) break
            counts[best]++
        }
    }
    const out: Segment[] = []
    totals.forEach((total, cutIndex) => {
        if (!balance) {
            for (let f = 0; f < total; f += maxFrames) out.push({ cutIndex, firstFrame: f, frames: Math.min(maxFrames, total - f) })
            return
        }
        const n = counts[cutIndex]
        for (let k = 0; k < n; k++) {
            const first = Math.round((total * k) / n)
            const end = Math.round((total * (k + 1)) / n)
            if (end > first) out.push({ cutIndex, firstFrame: first, frames: end - first })
        }
    })
    return out
}

/** A unit of a journaled render, in output order: the title card, a stretch (or whole) of a cut, the full-time card. */
export type OrderedUnit<S extends { cutIndex: number } = Segment> = { kind: 'intro' } | { kind: 'outro' } | { kind: 'segment'; segment: S }

/**
 * The render's units in output order: the segments of cuts before `introAfterCut` (a teaser), the title card, the other
 * segments, the full-time card. Without `introAfterCut` (or 0) the title card comes first, as resumable jobs saved before it expect.
 */
export function orderUnits<S extends { cutIndex: number }>(segments: S[], introAfterCut = 0): OrderedUnit<S>[] {
    const seg = (segment: S): OrderedUnit<S> => ({ kind: 'segment', segment })
    return [
        ...segments.filter((s) => s.cutIndex < introAfterCut).map(seg),
        { kind: 'intro' },
        ...segments.filter((s) => s.cutIndex >= introAfterCut).map(seg),
        { kind: 'outro' },
    ]
}

/**
 * Unit boundaries that survive small edits (for the unit cache): every cut is split on its own, from its own first frame, into
 * pieces of exactly `maxFrames` (a tail shorter than `minFrames` joins the piece before it). A cut's units never depend on the
 * other cuts, so changing or trimming one goal leaves every other goal's units (and so their cache keys) as they were, and
 * trimming the end of a long cut only changes its last piece.
 */
export function stableSegments(totals: number[], maxFrames: number, minFrames: number): Segment[] {
    const out: Segment[] = []
    totals.forEach((total, cutIndex) => {
        const starts: number[] = []
        for (let f = 0; f < total; f += maxFrames) starts.push(f)
        if (starts.length > 1 && total - starts[starts.length - 1] < minFrames) starts.pop()
        starts.forEach((first, k) => out.push({ cutIndex, firstFrame: first, frames: (starts[k + 1] ?? total) - first }))
    })
    return out
}

// ---- blocks on the source's own frame grid (for the unit cache) ----

/** Shortest and longest block (seconds of output) gridBlockFrames aims for. */
export const BLOCK_SEC = 10
export const BLOCK_MAX_SEC = 30
const AAC_FRAME_SAMPLES = 1024

/**
 * Frames per block. Normally ~BLOCK_SEC rounded to whole key-frame intervals. When the audio of a block is built per block (silence, or
 * re-encoded to AAC) the block must also last a whole number of AAC frames, or every join would gain or lose a fraction of a frame
 * of audio (and a 110-minute match would drift): then the shortest such length of BLOCK_SEC … BLOCK_MAX_SEC.
 */
export function gridBlockFrames(frameSec: number, keyFrames: number, audio: { sampleRate: number; exact: boolean } | null): number {
    const plain = Math.max(keyFrames, Math.round(BLOCK_SEC / frameSec / keyFrames) * keyFrames)
    if (!audio?.exact) return plain
    for (let n = Math.ceil(BLOCK_SEC / frameSec); n <= Math.floor(BLOCK_MAX_SEC / frameSec); n++) {
        const samples = n * frameSec * audio.sampleRate
        if (Math.abs(samples / AAC_FRAME_SAMPLES - Math.round(samples / AAC_FRAME_SAMPLES)) < 1e-6) return n
    }
    return Math.max(keyFrames, Math.round(20 / frameSec / keyFrames) * keyFrames)
}

/** Snaps away float noise when turning a time into a frame number (1/1000 of a frame). */
const SNAP = 1e-3

/** A speed-1 cut's frames on the source grid: absolute frame numbers `first` … `end - 1` (the frames whose time lies in [start, end)). At least one. */
export function gridSpan(c: PlanCut, frameSec: number): { first: number; end: number } {
    const first = Math.ceil(c.startSec / frameSec - SNAP)
    return { first, end: Math.max(first + 1, Math.ceil(c.endSec / frameSec - SNAP)) }
}

/** Cuts played at normal speed sit on the source's frame grid; slowed replays keep being timed from their own start. */
export const onGrid = (c: PlanCut): boolean => (c.speed ?? 1) === 1

/** Output frames of a cut in the render (grid cuts: frames on the source grid; others: cutFrames). */
export function planFrames(c: PlanCut, frameSec: number): number {
    if (!onGrid(c)) return cutFrames(c, frameSec)
    const g = gridSpan(c, frameSec)
    return g.end - g.first
}

/**
 * Blocks for the unit cache: every normal-speed cut is split on a fixed grid of the SOURCE's frame numbers (a multiple of
 * `blockFrames`), not from the cut's own first frame, so a block shows the same pictures, with the same frame numbers, whatever the
 * cut around it does: moving kick-off, adding a replay or trimming a clip only changes the partial blocks at the cut's edges. The
 * frames of a cut are the source frames inside it; the output keeps each one at its own source frame number, so picture and audio
 * of a block depend on its source span alone. Slowed cuts (replays) are short: pieces of at most `maxFrames` from their own start.
 */
export function gridSegments(cuts: PlanCut[], frameSec: number, blockFrames: number, maxFrames: number): Segment[] {
    const out: Segment[] = []
    cuts.forEach((c, cutIndex) => {
        if (!onGrid(c)) {
            const total = cutFrames(c, frameSec)
            for (let f = 0; f < total; f += maxFrames) out.push({ cutIndex, firstFrame: f, frames: Math.min(maxFrames, total - f) })
            return
        }
        const { first, end } = gridSpan(c, frameSec)
        for (let m = first; m < end;) {
            const next = Math.min(end, (Math.floor(m / blockFrames) + 1) * blockFrames)
            out.push({ cutIndex, firstFrame: m - first, frames: next - m, grid: m })
            m = next
        }
    })
    return out
}

/** The source seconds [a, b) a segment draws from (the pictures at a + j × frameSec × speed, the audio between a and b). */
export function segmentSpan(c: PlanCut, seg: Segment, frameSec: number): { a: number; b: number } {
    if (seg.grid !== undefined) return { a: seg.grid * frameSec, b: (seg.grid + seg.frames) * frameSec }
    return { a: sourceTimeOf(c, seg.firstFrame, frameSec), b: sourceTimeOf(c, seg.firstFrame + seg.frames, frameSec) }
}

/** Source time of output frame `frame` of a cut. */
export function sourceTimeOf(c: PlanCut, frame: number, frameSec: number): number {
    return c.startSec + frame * frameSec * (c.speed ?? 1)
}

/** AudioSpecificConfig of AAC-LC (what an MP4's esds needs when the encoder gives none). */
export function aacConfig(sampleRate: number, channels: number): Uint8Array {
    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
    const idx = rates.indexOf(sampleRate)
    if (idx === -1) throw new Error(`AAC cannot be written at ${sampleRate} Hz`)
    const word = (2 << 11) | (idx << 7) | (channels << 3)
    return new Uint8Array([word >> 8, word & 255])
}
