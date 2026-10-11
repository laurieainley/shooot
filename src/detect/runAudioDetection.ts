import { AUDIO_DETECT } from './detectConfig'
import { decodeMono } from './audioSource'
import { createFeatureExtractor, type FeatureExtractor } from './featureExtractor'
import { goalScores, pickMoments, placeOnTimeline, type ScoredMoment } from '../utils/goalAudioScore'
import { finalWhistleSec, kickOffSec } from '../utils/matchClock'
import type { AudioFeatures } from '../utils/audioFeatures'
import type { MatchEvent } from '../types'

export type DetectFile = { file: File; durationSec: number; offsetSec: number }
export type DetectDeps = {
    decode: typeof decodeMono
    extractor: () => FeatureExtractor
    /** In-thread extractor used for a file again when the worker one fails (e.g. a worker chunk that 404s after a deploy). */
    fallbackExtractor?: () => FeatureExtractor
}
export const defaultDetectDeps: DetectDeps = {
    decode: decodeMono,
    extractor: () => createFeatureExtractor(AUDIO_DETECT),
    fallbackExtractor: () => createFeatureExtractor(AUDIO_DETECT, false),
}

/** How many moments to shortlist for `analysedSec` of footage. */
export function suggestionCount(analysedSec: number): number {
    const n = Math.round((AUDIO_DETECT.maxPerHour * analysedSec) / 3600)
    return Math.min(AUDIO_DETECT.maxSuggestionsCap, Math.max(AUDIO_DETECT.minSuggestions, n))
}

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
        const extract = async (make: () => FeatureExtractor): Promise<AudioFeatures | null> => {
            const ex = make()
            try {
                const hasAudio = await deps.decode(f.file, (mono, sr, t) => { ex.push(mono, sr); report(Math.min(0.99, (done + t) / workSec)) }, signal)
                return hasAudio ? await Promise.race([ex.finish(), aborted]) : null
            } finally {
                ex.dispose()
            }
        }
        let feats: AudioFeatures | null
        try {
            feats = await extract(deps.extractor)
        } catch (e) {
            // A worker that cannot start (stale chunk after a deploy) must not cost the run: do this file on this thread.
            if (signal.aborted || !deps.fallbackExtractor) throw e
            feats = await extract(deps.fallbackExtractor)
        }
        if (feats) parts.push({ features: feats, offsetSec: f.offsetSec })
        if (signal.aborted) throw new Error('Cancelled')
        done += f.durationSec
    }
    const timeline = placeOnTimeline(parts, totalSec, AUDIO_DETECT.hopSec)
    const scores = goalScores(timeline, AUDIO_DETECT)
    const moments = parts.length === 0 ? [] : pickMoments(scores, AUDIO_DETECT.hopSec,
        { minGapSec: AUDIO_DETECT.minGapSec, max: suggestionCount(rangeSec[1] - rangeSec[0]), startSec: rangeSec[0], endSec: rangeSec[1] })
    report(1)
    return { moments, scores, analysedSec: Math.round(rangeSec[1] - rangeSec[0]) }
}
