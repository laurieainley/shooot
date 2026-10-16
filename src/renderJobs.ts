// The one render that can run at a time, kept outside the Export panel: closing the panel, playing the video or
// opening sheets never touches it. Components subscribe; the panel, the top-bar chip and the fullscreen chip all show it.
import { PRODUCT_NAME } from './brand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { GraphicsReport } from './render/types'
import type { DiagnosticsReport } from './render/diagnostics'
import type { Cut, RenderFn, RenderGraphics, RenderSource, RenderTimeline } from './render/types'
import { saveTimeline } from './renderTimelines'
import { clearSavedParts, isStorageFull, storageFullMessage } from './render/storage'
import type { JobKind } from './render/renderJob'
import type { RenderQuality } from './utils/renderSources'
import type { OutputQuality } from './render/transcodePlan'
import { recordRender } from './utils/renderTime'
import { formatRenderProgress } from './utils/renderSources'
import { createRenderWakeLock, type RenderWakeLock } from './renderWakeLock'
import type { ReuseKeys } from './render/unitCache'
import { recoverFromStaleChunk } from './staleBuildRecovery'

export type RenderRequest = {
    cuts: Cut[]
    sources: RenderSource[]
    graphics?: RenderGraphics
    outputName: string
    /** Identity of the plan (ExportPlan.signature): the real cut times of a finished render are kept under it. */
    signature?: string
    /** Save progress so the render can carry on after a reload. */
    resumable?: { signature: string; kind: Exclude<JobKind, 'clip'> }
    /** Re-encode to H.264 at this quality instead of stream copying (Full match 4K / 1080p). */
    output?: { quality: '4k' | '1080p'; videoBitrate: number }
    /** Re-encodes: what the engine needs to reuse parts of the last export of this kind (see render/unitCache). */
    reuse?: ReuseKeys
    /** "Save to file…": the engine streams the MP4 straight into this file (no resumable journal, no reused parts, no download). */
    targetFile?: FileSystemFileHandle
}

/** A first progress reading above this share means the render resumed a saved one. */
const RESUMED_AT = 0.05

export type JobPhase = 'running' | 'done' | 'failed'

export type RenderJob = {
    id: number
    kind: JobKind
    quality: RenderQuality
    /** What the render outputs: Original (stream copy), or a 4K / 1080p re-encode. */
    output?: OutputQuality
    /** The cost model's estimate of the whole render in seconds (typical device of this class), once the engine has priced the work. */
    estimateSec?: number
    /** How many parts of this re-encode came from the last export instead of being encoded. */
    reused?: { units: number; of: number }
    phase: JobPhase
    startedAt: number
    fraction: number
    status: string
    report: GraphicsReport | null
    /** Diagnostics of this render, set when it ends (done, failed or cancelled). */
    diagnostics?: DiagnosticsReport | null
    /** `savedTo`: the name of the file the render was written into ("Save to file…"); then there is no object URL (`url` is empty) and nothing to download. */
    result: { file: File; url: string; downloaded: boolean; savedTo?: string } | null
    error: string | null
    /** Waiting for the user: footage of another frame size will be re-encoded (Render / Cancel). */
    notice?: string | null
    finishedAt: number | null
}

export type RenderJobDeps = {
    render: RenderFn
    /** Saves the file (programmatic download); false if it could not be started. */
    download: (url: string, name: string) => boolean
    /** Long render finished: desktop notification when hidden. */
    notify: (job: RenderJob, elapsedMs: number) => void
    now: () => number
    createUrl: (file: File) => string
    revokeUrl: (url: string) => void
    /** Keeps the screen awake while a render runs (default: the browser's Screen Wake Lock). */
    wakeLock?: () => RenderWakeLock
}

export type RenderJobsState = {
    job: RenderJob | null
    /** A second render was asked for while one runs (the panel offers to cancel the current one). */
    conflict: boolean
    /** A cancelled render is still winding down (can take ~30 s). Its job is already gone from the UI; a new start waits for it. */
    stopping: boolean
    /** A render was asked for while the previous one is stopping; it starts when the stop completes. */
    queued: boolean
    running: () => boolean
    start: (what: { kind: JobKind; quality: RenderQuality; output?: OutputQuality }, prepare: () => Promise<RenderRequest>) => Promise<'started' | 'busy'>
    cancel: () => void
    /** Answers the pending notice: true carries on, false cancels the render. */
    answerNotice: (ok: boolean) => void
    /** Reports from preparing graphics (before the engine runs). */
    setReport: (report: GraphicsReport) => void
    clearConflict: () => void
    downloadAgain: () => void
}

export function createRenderJobs(deps: RenderJobDeps): StoreApi<RenderJobsState> {
    let controller: AbortController | null = null
    let seq = 0
    let pending: ((ok: boolean) => void) | null = null
    // The run in flight, and, once cancelled, the promise that settles when it has really stopped.
    let current: { id: number; ended: Promise<void>; end: () => void } | null = null
    let stopWait: Promise<void> | null = null
    return createStore<RenderJobsState>()((set, get) => {
        const patch = (id: number, p: Partial<RenderJob>): void => {
            const job = get().job
            if (job && job.id === id) set({ job: { ...job, ...p } })
        }
        return {
            job: null,
            conflict: false,
            stopping: false,
            queued: false,
            running: () => get().job?.phase === 'running',
            start: async ({ kind, quality, output = 'original' }, prepare) => {
                if (stopWait) {
                    if (get().queued) return 'busy'
                    set({ queued: true })
                    while (stopWait) await stopWait
                    set({ queued: false })
                }
                if (get().running()) { set({ conflict: true }); return 'busy' }
                const old = get().job?.result
                if (old?.url) deps.revokeUrl(old.url)
                const id = ++seq
                const startedAt = deps.now()
                controller = new AbortController()
                const lock = deps.wakeLock?.()
                void lock?.acquire().catch(() => {})
                const signal = controller.signal
                let end!: () => void
                const ended = new Promise<void>((r) => { end = r })
                current = { id, ended, end }
                set({ conflict: false, job: { id, kind, quality, output, phase: 'running', startedAt, fraction: 0, status: 'Preparing…', report: null, diagnostics: null, result: null, error: null, notice: null, finishedAt: null } })
                try {
                    const req = await prepare()
                    if (signal.aborted) throw new DOMException('Render cancelled', 'AbortError')
                    let timeline: RenderTimeline | null = null
                    // The engine's own clock, for the learned device rates: from the moment it has priced the work to the end.
                    const engine = { at: 0, resumed: null as boolean | null, started: false }
                    const out = await deps.render(req.cuts, req.sources, {
                        onProgress: (p) => {
                            if (p.estimateSec) { engine.at = deps.now(); engine.resumed = null; engine.started = true; patch(id, { estimateSec: p.estimateSec }) }
                            // A render picked up from a saved one starts part way in: its wall time says nothing about the whole.
                            else if (engine.started && engine.resumed === null) engine.resumed = p.fraction > RESUMED_AT
                            patch(id, { fraction: p.fraction, status: formatRenderProgress(p), ...(p.reused ? { reused: p.reused } : {}) })
                        },
                        signal,
                        kind,
                        ...(lock ? { wakeLockStatus: () => lock.status() } : {}),
                        confirmMixedSizes: (notice) => new Promise<boolean>((resolve) => {
                            pending = resolve
                            patch(id, { notice, status: 'Waiting for you' })
                        }),
                        outputName: req.outputName,
                        onTimeline: (t) => { timeline = t },
                        ...(req.resumable ? { resumable: req.resumable } : {}),
                        ...(req.output ? { output: req.output } : {}),
                        ...(req.reuse ? { reuse: req.reuse } : {}),
                        ...(req.targetFile ? { experiments: { targetFile: req.targetFile } } : {}),
                        // Reports also come for replay crops, which are drawn even when there are no graphics.
                        onGraphics: (report) => patch(id, { report }),
                        onDiagnostics: (diagnostics) => patch(id, { diagnostics }),
                        ...(req.graphics ? { graphics: req.graphics } : {}),
                    })
                    // Cancelled while it was finishing: the user said stop, so no file, no download, no notification.
                    if (signal.aborted) throw new DOMException('Render cancelled', 'AbortError')
                    if (timeline && req.signature && kind !== 'clip') saveTimeline(kind, req.signature, timeline)
                    const file = out instanceof File && (req.targetFile || out.name === req.outputName) ? out : new File([out], req.outputName, { type: 'video/mp4' })
                    const elapsed = deps.now() - startedAt
                    const priced = get().job?.id === id ? get().job!.estimateSec : undefined
                    // A run that reused parts of the last export is faster than the device is: it must not teach the learned rate.
                    // A render into a picked file records like any other: its units run in parallel as a journaled render's do (the ones ahead wait in memory), and it is never resumed or reused.
                    if (priced && engine.started && engine.resumed === false && !get().job?.reused?.units) recordRender(output, priced, (deps.now() - engine.at) / 1000)
                    // Saved straight to disk: no object URL, no download.
                    const result = req.targetFile ? { file, url: '', downloaded: false, savedTo: req.targetFile.name } : (() => { const url = deps.createUrl(file); return { file, url, downloaded: deps.download(url, file.name) } })()
                    patch(id, { phase: 'done', fraction: 1, status: `Done in ${Math.max(1, Math.round(elapsed / 1000))} s`, result, finishedAt: deps.now() })
                    deps.notify(get().job!, elapsed)
                } catch (e) {
                    if (signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
                        if (get().job?.id === id) set({ job: null })
                    } else {
                        const error = isStorageFull(e) ? await storageFullMessage(await clearSavedParts().then(() => true, () => false)) : e instanceof Error ? e.message : String(e)
                        patch(id, { phase: 'failed', error, status: 'Render failed', finishedAt: deps.now() })
                    }
                } finally {
                    void lock?.release().catch(() => {})
                    if (seq === id) controller = null
                    if (current?.id === id) current = null
                    end()
                    if (stopWait === ended) { stopWait = null; set({ stopping: false }) }
                }
                return 'started'
            },
            cancel: () => {
                const wasRunning = get().running()
                controller?.abort()
                get().answerNotice(false)
                // Hide the job at once; the engine may take a while to wind down, and nothing it reports afterwards is shown.
                if (wasRunning && current) { stopWait = current.ended; set({ job: null, conflict: false, stopping: true }) }
                else set({ conflict: false })
            },
            answerNotice: (ok) => {
                const resolve = pending
                pending = null
                const job = get().job
                if (job?.notice) set({ job: { ...job, notice: null, status: ok ? 'Preparing…' : job.status } })
                resolve?.(ok)
            },
            setReport: (report) => { const j = get().job; if (j) set({ job: { ...j, report } }) },
            clearConflict: () => set({ conflict: false }),
            downloadAgain: () => {
                const r = get().job?.result
                if (r && !r.savedTo) deps.download(r.url, r.file.name)
            },
        }
    })
}

/** Starts a download of an object URL without leaving the page. */
export function clickDownload(url: string, name: string): boolean {
    try {
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.rel = 'noopener'
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        a.remove()
        return true
    } catch {
        return false
    }
}

let defaultDeps: RenderJobDeps | null = null
let instance: StoreApi<RenderJobsState> | null = null

/** The app's render jobs (the engine is loaded lazily, so importing this stays cheap). */
export function renderJobs(): StoreApi<RenderJobsState> {
    if (!instance) {
        defaultDeps ??= {
            render: async (...args) => {
                let engine: typeof import('./render')
                try {
                    engine = await import('./render')
                } catch (e) {
                    // This tab is running an older build whose engine file is gone after a deploy.
                    if (recoverFromStaleChunk(e)) throw new Error(`A new version of ${PRODUCT_NAME} is available — reloading…`)
                    throw e
                }
                return engine.renderReel(...args)
            },
            download: clickDownload,
            notify: (job, ms) => { void import('./components/notify').then((n) => { if (ms >= 20_000) n.notifyIfHidden('Render finished', `${job.result?.file.name ?? 'Your video'} is ready`) }) },
            now: () => Date.now(),
            createUrl: (f) => URL.createObjectURL(f),
            revokeUrl: (u) => URL.revokeObjectURL(u),
            wakeLock: () => createRenderWakeLock(),
        }
        instance = createRenderJobs(defaultDeps)
    }
    return instance
}

export function useRenderJobs<T>(selector: (s: RenderJobsState) => T): T {
    return useStore(renderJobs(), selector)
}

/** Tests: forget the running job and start from a fresh manager. */
export function resetRenderJobs(): void {
    instance?.getState().cancel()
    instance = null
}
