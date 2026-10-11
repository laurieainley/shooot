import { AUDIO_DETECT } from './detectConfig'
import { decodeMono } from './audioSource'
import { createFeatureExtractor, type FeatureExtractor } from './featureExtractor'
import { goalScores, pickMoments, placeOnTimeline, type ScoredMoment } from '../utils/goalAudioScore'
import { finalWhistleSec, kickOffSec } from '../utils/matchClock'
import type { AudioFeatures } from '../utils/audioFeatures'
import type { MatchEvent } from '../types'

export type DetectFile = { file: File; durationSec: number; offsetSec: number }
export type DetectDeps = { decode: typeof decodeMono; extractor: () => FeatureExtractor }
export const defaultDetectDeps: DetectDeps = { decode: decodeMono, extractor: () => createFeatureExtractor(AUDIO_DETECT) }

/** Kick off → Final whistle when both are set and in order, else the whole timeline. */
export function detectionRange(events: MatchEvent[], offsets: number[], totalSec: number): [number, number] {
    const ko = kickOffSec(events, offsets), fw = finalWhistleSec(events, offsets)
    if (fw !== null && fw > ko) return [ko, fw]
    if (fw === null && ko > 0 && ko < totalSec) return [ko, totalSec]
    return [0, totalSec]
}

/** Decode each file's audio, extract features, score the whole timeline and pick moments inside `rangeSec`. */
export async function runAudioDetection(files: DetectFile[], rangeSec: [number, number], deps: DetectDeps, signal: AbortSignal,
    onProgress: (fraction: number) => void): Promise<{ moments: ScoredMoment[]; scores: Float32Array; analysedSec: number }> {
    const totalSec = Math.max(0, ...files.map((f) => f.offsetSec + f.durationSec))
    const inRange = (f: DetectFile): boolean => f.offsetSec + f.durationSec > rangeSec[0] && f.offsetSec < rangeSec[1]
    const workSec = Math.max(1, files.filter(inRange).reduce((s, f) => s + f.durationSec, 0))
    let last = 0
    const report = (v: number): void => {
        const x = Math.max(last, Math.min(1, v))
        if (x === 1 ? last < 1 : x - last >= 0.005) { last = x; onProgress(x) }
    }
    const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('Cancelled'))
        else signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true })
    })
    aborted.catch(() => {})
    const parts: { features: AudioFeatures; offsetSec: number }[] = []
    let done = 0
    for (const f of files) {
        if (signal.aborted) throw new Error('Cancelled')
        if (!inRange(f)) continue
        const ex = deps.extractor()
        try {
            const hasAudio = await deps.decode(f.file, (mono, sr, t) => { ex.push(mono, sr); report(Math.min(0.99, (done + t) / workSec)) }, signal)
            const feats = hasAudio ? await Promise.race([ex.finish(), aborted]) : null
            if (feats) parts.push({ features: feats, offsetSec: f.offsetSec })
        } finally {
            ex.dispose()
        }
        if (signal.aborted) throw new Error('Cancelled')
        done += f.durationSec
    }
    const timeline = placeOnTimeline(parts, totalSec, AUDIO_DETECT.hopSec)
    const scores = goalScores(timeline, AUDIO_DETECT)
    const moments = parts.length === 0 ? [] : pickMoments(scores, AUDIO_DETECT.hopSec,
        { minGapSec: AUDIO_DETECT.minGapSec, max: AUDIO_DETECT.maxSuggestions, startSec: rangeSec[0], endSec: rangeSec[1] })
    report(1)
    return { moments, scores, analysedSec: Math.round(rangeSec[1] - rangeSec[0]) }
}
