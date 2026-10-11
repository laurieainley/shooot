import type { AudioFeatures } from './audioFeatures'

export type ScoredMoment = { timeSec: number; score: number }

/** Centred moving average over `n` samples (edges average what is available); NaN samples are skipped. */
export function movingAverage(x: Float32Array, n: number): Float32Array {
    const out = new Float32Array(x.length), h = Math.floor(n / 2)
    for (let i = 0; i < x.length; i++) {
        let s = 0, c = 0
        for (let j = Math.max(0, i - h); j <= Math.min(x.length - 1, i + h); j++) if (!Number.isNaN(x[j])) { s += x[j]; c++ }
        out[i] = c ? s / c : NaN
    }
    return out
}

const median = (v: number[]): number => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** (x − median) / (1.4826·MAD) over the finite values; NaN becomes 0 (neutral). */
export function robustZ(x: Float32Array): Float32Array {
    const fin = Array.from(x).filter(Number.isFinite)
    const out = new Float32Array(x.length)
    if (fin.length === 0) return out
    const med = median(fin), mad = median(fin.map((v) => Math.abs(v - med))) * 1.4826 + 1e-9
    for (let i = 0; i < x.length; i++) out[i] = Number.isFinite(x[i]) ? (x[i] - med) / mad : 0
    return out
}

/** Joins per-file features on the whole timeline (files are contiguous, `offsetSec` from computeCumulativeOffsets); gaps are NaN. */
export function placeOnTimeline(parts: { features: AudioFeatures; offsetSec: number }[], totalSec: number, hopSec: number): AudioFeatures {
    const n = Math.max(0, Math.round(totalSec / hopSec))
    const loud = new Float32Array(n).fill(NaN), voice = new Float32Array(n).fill(NaN)
    for (const { features, offsetSec } of parts) {
        const at = Math.round(offsetSec / hopSec)
        for (let i = 0; i < features.loudDb.length && at + i < n; i++) { loud[at + i] = features.loudDb[i]; voice[at + i] = features.voiceDb[i] }
    }
    return { hopSec, loudDb: loud, voiceDb: voice }
}

/** score(t) = max(voice z over t+peak window) − mean(loudness z over t+hush window), after `smoothSec` smoothing. */
export function goalScores(f: AudioFeatures, cfg: { smoothSec: number; peakWindowSec: readonly [number, number]; hushWindowSec: readonly [number, number] }): Float32Array {
    const hop = f.hopSec, sm = Math.max(1, Math.round(cfg.smoothSec / hop))
    const loud = robustZ(movingAverage(f.loudDb, sm)), voice = robustZ(movingAverage(f.voiceDb, sm))
    const n = loud.length, out = new Float32Array(n)
    const [pa, pb] = cfg.peakWindowSec.map((s) => Math.round(s / hop)), [ha, hb] = cfg.hushWindowSec.map((s) => Math.round(s / hop))
    for (let i = 0; i < n; i++) {
        let peak = -Infinity
        for (let j = Math.max(0, i + pa); j <= Math.min(n - 1, i + pb); j++) peak = Math.max(peak, voice[j])
        let s = 0, c = 0
        for (let j = Math.max(0, i + ha); j <= Math.min(n - 1, i + hb); j++) { s += loud[j]; c++ }
        out[i] = (peak === -Infinity ? 0 : peak) - (c ? s / c : 0)
    }
    return out
}

/** Highest-scoring moments inside [startSec, endSec], at least `minGapSec` apart, at most `max`, returned in time order. */
export function pickMoments(scores: Float32Array, hopSec: number, opts: { minGapSec: number; max: number; startSec: number; endSec: number }): ScoredMoment[] {
    const order = Array.from(scores.keys()).filter((i) => {
        const t = i * hopSec
        return t >= opts.startSec && t <= opts.endSec && Number.isFinite(scores[i])
    }).sort((a, b) => scores[b] - scores[a])
    const picked: ScoredMoment[] = []
    for (const i of order) {
        if (picked.length >= opts.max) break
        const t = i * hopSec
        if (picked.every((p) => Math.abs(p.timeSec - t) >= opts.minGapSec)) picked.push({ timeSec: Math.round(t * 10) / 10, score: scores[i] })
    }
    return picked.sort((a, b) => a.timeSec - b.timeSec)
}
