// The one Find goals (Beta) analysis, kept outside the UI like renderJobs.ts: closing the review panel never stops it.
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useAppState } from './state'
import { AUDIO_DETECT } from './detect/detectConfig'
import { defaultDetectDeps, detectionRange, runAudioDetection } from './detect/runAudioDetection'
import { fileKeys } from './utils/fileKey'
import { BallDecodeError, runBallCheck, type BallCheckDeps, type BallDetectorLike } from './detect/runBallCheck'
import { createBallDetector } from './detect/ballDetector'
import { effectiveStatus } from './utils/suggestions'
import { createRenderWakeLock, type RenderWakeLock } from './renderWakeLock'

export type DetectPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
export type BallPhase = 'idle' | 'running' | 'done' | 'failed'
export type DetectJobState = {
    phase: DetectPhase; fraction: number; error: string | null; scores: Float32Array | null
    /** Labs ball check (phase 2): runs after the audio suggestions are saved, so the review can start meanwhile. */
    ballPhase: BallPhase; ballFraction: number; ballError: string | null; ballMs: number | null
    /** The ball model's execution provider once it is ready (null while loading); the raw reason behind a decode failure. */
    ballEp: string | null; ballDetail: string | null
    /** Ball model download progress 0..1 while it is being fetched; null = not downloading (or done). */
    ballDownload: number | null
}
type JobDeps = { run: typeof runAudioDetection; wakeLock: () => RenderWakeLock; now: () => number; ball: typeof runBallCheck; ballDeps: BallCheckDeps; preload: () => Promise<unknown> }

const defaultBallDeps: BallCheckDeps = {
    frames: async (file) => (await import('./detect/frameSource')).createFrameSource(file),
    detector: (onDownload) => createBallDetector(undefined, undefined, onDownload), // the job creates it when Find goals starts
}
const IDLE_BALL = { ballPhase: 'idle', ballFraction: 0, ballError: null, ballMs: null, ballEp: null, ballDetail: null, ballDownload: null } as const

/** The user-facing line for a failed ball check. */
export function ballErrorLine(e: unknown): string {
    if (e instanceof BallDecodeError) return "Ball check failed: this browser can't decode the video."
    const msg = e instanceof Error ? e.message : String(e)
    return /model not found/i.test(msg) ? 'Ball check unavailable: model not found.' : `Ball check failed: ${msg}`
}

const sameFiles = (a: (File | undefined)[], b: (File | undefined)[]): boolean => a.length === b.length && a.every((f, i) => f === b[i])

/** `wholeVideo` ignores Kick off / Final whistle; `ball` (Advanced detection) also runs the Labs goal-mouth check. */
export type StartOptions = { wholeVideo?: boolean; ball?: boolean }

export function createDetectJobs(over: Partial<JobDeps> = {}): { store: StoreApi<DetectJobState>; start: (opts?: StartOptions) => Promise<void>; cancel: () => void } {
    const deps: JobDeps = { run: runAudioDetection, wakeLock: createRenderWakeLock, now: () => Date.now(), ball: runBallCheck, ballDeps: defaultBallDeps, preload: () => import('./detect/frameSource'), ...over }
    const store = createStore<DetectJobState>(() => ({ phase: 'idle', fraction: 0, error: null, scores: null, ...IDLE_BALL }))
    let ac: AbortController | null = null
    const start = async (opts?: StartOptions): Promise<void> => {
        if (store.getState().phase === 'running') return
        ac?.abort() // a ball check still running from the last run: the new run replaces it
        const app = useAppState.getState()
        const files = app.files
            .map((f, i) => ({ file: f.file, durationSec: f.durationSec ?? 0, offsetSec: app.cumulativeOffsets[i] ?? 0 }))
            .filter((f): f is { file: File; durationSec: number; offsetSec: number } => !!f.file && f.durationSec > 0)
        if (files.length === 0) { store.setState({ phase: 'failed', fraction: 0, error: 'Load the match videos first.', scores: null, ...IDLE_BALL }); return }
        // Phase 2 reads the full-quality files (the audio pass uses the proxy), same offsets and durations.
        const ballFiles = app.files.flatMap((f, i) => {
            const file = f.fullFile ?? f.file, durationSec = f.durationSec ?? 0
            return f.file && file && durationSec > 0 ? [{ file, durationSec, offsetSec: app.cumulativeOffsets[i] ?? 0 }] : []
        })
        const totalSec = Math.max(0, ...files.map((f) => f.offsetSec + f.durationSec))
        const range: [number, number] = opts?.wholeVideo ? [0, totalSec] : detectionRange(app.events, app.cumulativeOffsets, totalSec)
        const mine = new AbortController()
        ac = mine
        // The result belongs to these exact files: if they are replaced or removed meanwhile (new match, clear), drop it.
        const snapshot = app.files.map((f) => f.file)
        const keys = fileKeys(app.files)
        const startedAt = deps.now()
        const unwatch = useAppState.subscribe((s, prev) => {
            // Diagnostic (Beta): the review panel should never close by itself while Find goals runs.
            if (prev.panel === 'review' && s.panel !== 'review') console.warn('[Find goals] review panel closed', { to: s.panel, picker: !!s.picker }, new Error().stack)
            if (!sameFiles(snapshot, s.files.map((f) => f.file))) mine.abort()
            else if (!s.labs && store.getState().ballPhase === 'running') mine.abort() // Labs switched off: stop phase 2, the audio results stay
        })
        // Load the ball check now (worker chunk, onnxruntime, model, frame source): a deploy during a long audio pass
        // would otherwise remove the old build's lazy chunks, and the model download overlaps the audio pass.
        const app0 = useAppState.getState()
        let early: BallDetectorLike | undefined
        let disposeEarly = (): void => {}
        if (opts?.ball && app0.labs && app0.goalMarks && (app0.goalMarks.team1 || app0.goalMarks.team2) && ballFiles.length > 0) {
            const detector = deps.ballDeps.detector((f) => { if (ac === mine && !mine.signal.aborted) store.setState({ ballDownload: f }) })
            early = detector
            // Phase 2 disposes the detector it is given, the job's cleanup does too: only the first call counts.
            let disposed = false
            const dispose = detector?.dispose?.bind(detector)
            if (detector) detector.dispose = (): void => { if (!disposed) { disposed = true; dispose?.() } }
            disposeEarly = (): void => detector?.dispose()
            detector?.ready?.then(() => { if (ac === mine) store.setState({ ballDownload: null }) }, () => { if (ac === mine) store.setState({ ballDownload: null }) })
            deps.preload().catch(() => undefined)
        }
        const phase2Deps: BallCheckDeps = early ? { ...deps.ballDeps, detector: () => early! } : deps.ballDeps
        const lock = deps.wakeLock()
        store.setState({ phase: 'running', fraction: 0, error: null, scores: null, ...IDLE_BALL })
        await lock.acquire().catch(() => {})
        try {
            if (mine.signal.aborted) throw new Error('Cancelled')
            const r = await deps.run(files, range, defaultDetectDeps, mine.signal, (fraction) => store.setState({ fraction }))
            if (mine.signal.aborted || !sameFiles(snapshot, useAppState.getState().files.map((f) => f.file))) throw new Error('Cancelled')
            const now = deps.now()
            useAppState.getState().setSuggestions({ createdAt: now, source: 'audio', configVersion: AUDIO_DETECT.version, analysedSec: r.analysedSec, total: r.moments.length, durationMs: Math.max(0, now - startedAt), fileKeys: keys, bounded: range[0] > 0 || range[1] < totalSec }, r.moments)
            store.setState({ phase: 'done', fraction: 1, scores: r.scores })
            const after = useAppState.getState()
            if (opts?.ball && after.labs && after.goalMarks && (after.goalMarks.team1 || after.goalMarks.team2) && ballFiles.length > 0 && after.suggestions.length > 0) {
                const marks = after.goalMarks
                const ballStart = deps.now()
                store.setState({ ballPhase: 'running', ballFraction: 0, ballError: null, ballMs: null, ballEp: null, ballDetail: null })
                try {
                    const ball = await deps.ball({ suggestions: after.suggestions, marks, files: ballFiles, totalSec,
                        stillPending: (s) => { const st = useAppState.getState(); const cur = st.suggestions.find((x) => x.id === s.id); return !!cur && effectiveStatus(cur, new Set(st.events.map((e) => e.id))) === 'pending' } }, phase2Deps, mine.signal,
                        (ballFraction) => { if (ac === mine) store.setState({ ballFraction }) },
                        (id, ball) => { if (!mine.signal.aborted && sameFiles(snapshot, useAppState.getState().files.map((f) => f.file))) useAppState.getState().setSuggestionBall(id, ball) },
                        (ballEp) => { if (ac === mine) store.setState({ ballEp }) })
                    if (ac === mine) store.setState({ ballPhase: 'done', ballFraction: 1, ballMs: Math.max(0, deps.now() - ballStart), ballEp: ball?.ep ?? store.getState().ballEp })
                } catch (e) {
                    // Audio suggestions and any ball tags already written stay; cancelling is not an error.
                    const stop = mine.signal.aborted || (e instanceof Error && e.message === 'Cancelled')
                    if (ac === mine) store.setState(stop ? { ballPhase: 'idle', ballFraction: 0, ballMs: Math.max(0, deps.now() - ballStart) } : { ballPhase: 'failed', ballError: ballErrorLine(e), ballDetail: e instanceof BallDecodeError ? e.message : null, ballMs: Math.max(0, deps.now() - ballStart) })
                }
            }
        } catch (e) {
            const cancelled = mine.signal.aborted || (e instanceof Error && e.message === 'Cancelled')
            store.setState({ phase: cancelled ? 'cancelled' : 'failed', error: cancelled ? null : e instanceof Error ? e.message : String(e) })
        } finally {
            disposeEarly()
            unwatch()
            await lock.release().catch(() => {})
            if (ac === mine) ac = null
        }
    }
    return { store, start, cancel: () => ac?.abort() }
}

const jobs = createDetectJobs()
export const startDetection = (opts?: StartOptions): void => { void jobs.start(opts) }
export const cancelDetection = (): void => jobs.cancel()
export function useDetectJob<T>(selector: (s: DetectJobState) => T): T { return useStore(jobs.store, selector) }
export const getDetectJob = (): DetectJobState => jobs.store.getState()
