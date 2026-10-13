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

/** A resumable stretch of a cut: output frames `firstFrame` … `firstFrame + frames - 1` of cut `cutIndex`. */
export type Segment = { cutIndex: number; firstFrame: number; frames: number }

/**
 * Splits every cut into segments of at most `maxFrames` output frames (a render saves progress after each).
 * `balance`: cut the pieces of a cut to equal length instead of leaving a short tail, and, when the whole render would have
 * fewer than `units` segments, split the longest ones further (never below `minFrames` each) so that many can run side by side.
 */
export function planSegments(cuts: PlanCut[], frameSec: number, maxFrames: number, balance?: { units: number; minFrames: number }): Segment[] {
    const totals = cuts.map((c) => cutFrames(c, frameSec))
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
