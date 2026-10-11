// The one Find goals (Beta) analysis, kept outside the UI like renderJobs.ts: closing the review panel never stops it.
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useAppState } from './state'
import { AUDIO_DETECT } from './detect/detectConfig'
import { defaultDetectDeps, detectionRange, runAudioDetection } from './detect/runAudioDetection'
import { createRenderWakeLock, type RenderWakeLock } from './renderWakeLock'

export type DetectPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
export type DetectJobState = { phase: DetectPhase; fraction: number; error: string | null; scores: Float32Array | null }
type JobDeps = { run: typeof runAudioDetection; wakeLock: () => RenderWakeLock; now: () => number }

export function createDetectJobs(over: Partial<JobDeps> = {}): { store: StoreApi<DetectJobState>; start: () => Promise<void>; cancel: () => void } {
    const deps: JobDeps = { run: runAudioDetection, wakeLock: createRenderWakeLock, now: () => Date.now(), ...over }
    const store = createStore<DetectJobState>(() => ({ phase: 'idle', fraction: 0, error: null, scores: null }))
    let ac: AbortController | null = null
    const start = async (): Promise<void> => {
        if (store.getState().phase === 'running') return
        const app = useAppState.getState()
        const files = app.files
            .map((f, i) => ({ file: f.file, durationSec: f.durationSec ?? 0, offsetSec: app.cumulativeOffsets[i] ?? 0 }))
            .filter((f): f is { file: File; durationSec: number; offsetSec: number } => !!f.file && f.durationSec > 0)
        if (files.length === 0) { store.setState({ phase: 'failed', fraction: 0, error: 'Load the match videos first.', scores: null }); return }
        const totalSec = Math.max(0, ...files.map((f) => f.offsetSec + f.durationSec))
        const range = detectionRange(app.events, app.cumulativeOffsets, totalSec)
        const mine = new AbortController()
        ac = mine
        const lock = deps.wakeLock()
        store.setState({ phase: 'running', fraction: 0, error: null, scores: null })
        await lock.acquire().catch(() => {})
        try {
            if (mine.signal.aborted) throw new Error('Cancelled')
            const r = await deps.run(files, range, defaultDetectDeps, mine.signal, (fraction) => store.setState({ fraction }))
            useAppState.getState().setSuggestions({ createdAt: deps.now(), source: 'audio', configVersion: AUDIO_DETECT.version, analysedSec: r.analysedSec, total: r.moments.length }, r.moments)
            store.setState({ phase: 'done', fraction: 1, scores: r.scores })
        } catch (e) {
            const cancelled = mine.signal.aborted
            store.setState({ phase: cancelled ? 'cancelled' : 'failed', error: cancelled ? null : e instanceof Error ? e.message : String(e) })
        } finally {
            await lock.release().catch(() => {})
            ac = null
        }
    }
    return { store, start, cancel: () => ac?.abort() }
}

const jobs = createDetectJobs()
export const startDetection = (): void => { void jobs.start() }
export const cancelDetection = (): void => jobs.cancel()
export function useDetectJob<T>(selector: (s: DetectJobState) => T): T { return useStore(jobs.store, selector) }
export const getDetectJob = (): DetectJobState => jobs.store.getState()
