import type { GoalMarksByTeam, Suggestion } from '../types'
import { goalTiles, sampleTimes, tileToSource, ballVerdict, type BallSample, type BallVerdict } from '../utils/ballSampling'
import { globalToFileTime } from '../utils/matchStrip'
import type { BallDetector } from './ballDetector'
import type { FrameSource } from './frameSource'

export type FrameSourceLike = Pick<FrameSource, 'frameSize' | 'tilesAt' | 'dispose'>
export type BallDetectorLike = Pick<BallDetector, 'ready' | 'detect' | 'dispose'>
export type BallCheckFile = { file: File; durationSec: number; offsetSec: number }
export type BallCheckArgs = {
    suggestions: Suggestion[]
    marks: GoalMarksByTeam
    files: BallCheckFile[]
    totalSec: number
    /** Asked right before each suggestion: false = decided meanwhile, skip it. */
    stillPending?: (s: Suggestion) => boolean
}
export type BallCheckDeps = {
    frames: (file: File) => Promise<FrameSourceLike>
    detector: () => BallDetectorLike
}

const cancelled = (): Error => new Error('Cancelled')

/** The video could not be decoded for the ball check; `message` is the raw reason (for diagnostics only). */
export class BallDecodeError extends Error {
    constructor(message: string) { super(message); this.name = 'BallDecodeError' }
}
const asDecodeError = (e: unknown): Error => {
    if (e instanceof Error && e.message === 'Cancelled') return e
    return new BallDecodeError(e instanceof Error ? e.message : String(e))
}

/** Rejects as soon as `signal` aborts, whatever `p` is doing. */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) { p.catch(() => undefined); return Promise.reject(cancelled()) }
    return new Promise<T>((resolve, reject) => {
        const onAbort = (): void => reject(cancelled())
        signal.addEventListener('abort', onAbort, { once: true })
        p.then(
            (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
            (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
        )
    })
}

/**
 * Phase 2 of Find goals: for each pending suggestion, look for the ball in the marked goal mouths around it and report
 * the verdict straight away (null = not seen). One frame source per file and one detector for the whole run.
 */
export async function runBallCheck(
    args: BallCheckArgs,
    deps: BallCheckDeps,
    signal: AbortSignal,
    onProgress: (fraction: number) => void,
    onVerdict: (id: string, ball: BallVerdict | null) => void,
    onReady?: (ep: string) => void,
): Promise<{ ep: string | null }> {
    const pending = args.suggestions.filter((s) => s.status === 'pending')
    // No usable goal marked: nothing to look at, so no detector or decoder is opened.
    if (pending.length === 0 || goalTiles(args.marks, { w: 1, h: 1 }).length === 0) { onProgress(1); return { ep: null } }
    const sources = new Map<number, Promise<FrameSourceLike>>()
    const detector = deps.detector()
    detector.ready.catch(() => undefined)
    const offsets = args.files.map((f) => f.offsetSec)
    const durations = args.files.map((f) => f.durationSec)
    const source = (i: number): Promise<FrameSourceLike> => {
        let p = sources.get(i)
        if (!p) { p = deps.frames(args.files[i].file); p.catch(() => undefined); sources.set(i, p) }
        return p
    }
    try {
        const { ep } = await raceAbort(detector.ready, signal)
        onReady?.(ep)
        for (let n = 0; n < pending.length; n++) {
            if (signal.aborted) throw cancelled()
            const s = pending[n]
            if (args.stillPending && !args.stillPending(s)) { onProgress((n + 1) / pending.length); continue }
            const times = sampleTimes(s.globalTimeSec, { total: args.totalSec })
            const byFile = new Map<number, { global: number; local: number }[]>()
            for (const t of times) {
                // A time outside every available file (an unlinked file in between) has nothing to look at.
                if (!offsets.some((o, i) => t >= o && t < o + durations[i])) continue
                const at = globalToFileTime(offsets, durations, t)
                byFile.set(at.fileIndex, [...(byFile.get(at.fileIndex) ?? []), { global: t, local: at.timeSec }])
            }
            const samples: BallSample[] = []
            let primary: { w: number; h: number } | null = null
            const home = globalToFileTime(offsets, durations, s.globalTimeSec).fileIndex
            for (const [fileIndex, pts] of [...byFile.entries()].sort((a, b) => (a[0] === home ? -1 : b[0] === home ? 1 : a[0] - b[0]))) {
                const fs = await raceAbort(source(fileIndex), signal).catch((e) => { throw asDecodeError(e) })
                primary ??= fs.frameSize
                const tiles = goalTiles(args.marks, fs.frameSize)
                if (tiles.length === 0) continue
                const kx = primary.w / fs.frameSize.w, ky = primary.h / fs.frameSize.h
                const gen = fs.tilesAt(pts.map((p) => p.local), tiles, signal)
                try {
                    for (;;) {
                        const next = await raceAbort(gen.next(), signal).catch((e) => { throw asDecodeError(e) })
                        if (next.done) break
                        const global = (pts.find((p) => p.local === next.value.timeSec) ?? pts[0]).global
                        const found = await raceAbort(detector.detect(next.value.images, signal), signal)
                        tiles.forEach((tile, j) => {
                            const boxes = (found[j] ?? []).map((b) => tileToSource(b, tile)).map((b) => ({ ...b, x1: b.x1 * kx, x2: b.x2 * kx, y1: b.y1 * ky, y2: b.y2 * ky }))
                            samples.push({ timeSec: global, goal: tile.goal, boxes })
                        })
                    }
                } finally {
                    void gen.return(undefined)
                }
            }
            onVerdict(s.id, primary ? ballVerdict(samples, args.marks, primary, s.globalTimeSec) : null)
            onProgress((n + 1) / pending.length)
        }
        return { ep }
    } finally {
        detector.dispose()
        for (const p of sources.values()) void p.then((f) => f.dispose(), () => undefined)
    }
}
