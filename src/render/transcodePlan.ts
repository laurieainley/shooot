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

/** A resumable stretch of a cut: output frames `firstFrame` … `firstFrame + frames - 1` of cut `cutIndex`. */
export type Segment = { cutIndex: number; firstFrame: number; frames: number }

/** Splits every cut into segments of at most `maxFrames` output frames (a render saves progress after each). */
export function planSegments(cuts: PlanCut[], frameSec: number, maxFrames: number): Segment[] {
    const out: Segment[] = []
    cuts.forEach((c, cutIndex) => {
        const total = cutFrames(c, frameSec)
        for (let f = 0; f < total; f += maxFrames) out.push({ cutIndex, firstFrame: f, frames: Math.min(maxFrames, total - f) })
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
