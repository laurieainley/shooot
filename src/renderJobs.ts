// The one render that can run at a time, kept outside the Export panel: closing the panel, playing the video or
// opening sheets never touches it. Components subscribe; the panel, the top-bar chip and the fullscreen chip all show it.
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { GraphicsReport } from './render/types'
import type { Cut, RenderFn, RenderGraphics, RenderSource } from './render/types'
import type { JobKind } from './render/renderJob'
import type { RenderQuality } from './utils/renderSources'
import { formatRenderProgress } from './utils/renderSources'
import { recoverFromStaleChunk } from './staleBuildRecovery'

export type RenderRequest = {
    cuts: Cut[]
    sources: RenderSource[]
    graphics?: RenderGraphics
    outputName: string
    /** Save progress so the render can carry on after a reload. */
    resumable?: { signature: string; kind: JobKind }
}

export type JobPhase = 'running' | 'done' | 'failed'

export type RenderJob = {
    id: number
    kind: JobKind
    quality: RenderQuality
    phase: JobPhase
    startedAt: number
    fraction: number
    status: string
    report: GraphicsReport | null
    result: { file: File; url: string; downloaded: boolean } | null
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
}

export type RenderJobsState = {
    job: RenderJob | null
    /** A second render was asked for while one runs (the panel offers to cancel the current one). */
    conflict: boolean
    running: () => boolean
    start: (what: { kind: JobKind; quality: RenderQuality }, prepare: () => Promise<RenderRequest>) => Promise<'started' | 'busy'>
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
    return createStore<RenderJobsState>()((set, get) => {
        const patch = (id: number, p: Partial<RenderJob>): void => {
            const job = get().job
            if (job && job.id === id) set({ job: { ...job, ...p } })
        }
        return {
            job: null,
            conflict: false,
            running: () => get().job?.phase === 'running',
            start: async ({ kind, quality }, prepare) => {
                if (get().running()) { set({ conflict: true }); return 'busy' }
                const old = get().job?.result
                if (old) deps.revokeUrl(old.url)
                const id = ++seq
                const startedAt = deps.now()
                controller = new AbortController()
                const signal = controller.signal
                set({ conflict: false, job: { id, kind, quality, phase: 'running', startedAt, fraction: 0, status: 'Preparing…', report: null, result: null, error: null, notice: null, finishedAt: null } })
                try {
                    const req = await prepare()
                    if (signal.aborted) throw new DOMException('Render cancelled', 'AbortError')
                    const out = await deps.render(req.cuts, req.sources, {
                        onProgress: (p) => patch(id, { fraction: p.fraction, status: formatRenderProgress(p) }),
                        signal,
                        confirmMixedSizes: (notice) => new Promise<boolean>((resolve) => {
                            pending = resolve
                            patch(id, { notice, status: 'Waiting for you' })
                        }),
                        outputName: req.outputName,
                        ...(req.resumable ? { resumable: req.resumable } : {}),
                        // Reports also come for replay crops, which are drawn even when there are no graphics.
                        onGraphics: (report) => patch(id, { report }),
                        ...(req.graphics ? { graphics: req.graphics } : {}),
                    })
                    const file = out instanceof File && out.name === req.outputName ? out : new File([out], req.outputName, { type: 'video/mp4' })
                    const url = deps.createUrl(file)
                    const elapsed = deps.now() - startedAt
                    const downloaded = deps.download(url, file.name)
                    patch(id, { phase: 'done', fraction: 1, status: `Done in ${Math.max(1, Math.round(elapsed / 1000))} s`, result: { file, url, downloaded }, finishedAt: deps.now() })
                    deps.notify(get().job!, elapsed)
                } catch (e) {
                    if (e instanceof DOMException && e.name === 'AbortError') {
                        if (get().job?.id === id) set({ job: null })
                    } else {
                        patch(id, { phase: 'failed', error: e instanceof Error ? e.message : String(e), status: 'Render failed', finishedAt: deps.now() })
                    }
                } finally {
                    if (seq === id) controller = null
                }
                return 'started'
            },
            cancel: () => { controller?.abort(); get().answerNotice(false); set({ conflict: false }) },
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
                if (r) deps.download(r.url, r.file.name)
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
                    if (recoverFromStaleChunk(e)) throw new Error('A new version of Shooot is available — reloading…')
                    throw e
                }
                return engine.renderReel(...args)
            },
            download: clickDownload,
            notify: (job, ms) => { void import('./components/notify').then((n) => { if (ms >= 20_000) n.notifyIfHidden('Render finished', `${job.result?.file.name ?? 'Your video'} is ready`) }) },
            now: () => Date.now(),
            createUrl: (f) => URL.createObjectURL(f),
            revokeUrl: (u) => URL.revokeObjectURL(u),
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
