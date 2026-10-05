import { useEffect, useRef, useState } from 'react'
import { renderReel, type GraphicsReport } from '../render'
import { discardJob, loadJob, type JobKind, type JobState } from '../render/renderJob'
import type { Cut, RenderGraphics, RenderSource } from '../render/types'
import { useAppState } from '../state'
import { formatRenderProgress } from '../utils/renderSources'
import { askNotifyPermission, notifyIfHidden } from './notify'
import { useWakeLock } from './useWakeLock'

export type RenderRequest = {
    cuts: Cut[]
    sources: RenderSource[]
    graphics?: RenderGraphics
    outputName: string
    /** Save progress so the render can carry on after a reload. */
    resumable?: { signature: string; kind: JobKind }
    /** The whole reel is re-encoded (score always on screen): its speed is measured for the next estimate. */
    reencodeSec?: number
}

export type RenderResult = { url: string; file: File }

/** Long renders (at least this long) notify on desktop when they finish while the tab is hidden. */
const NOTIFY_AFTER_MS = 20_000

/** One render at a time: progress text, wake lock, cancel, desktop notification, result, skipped-graphics report. */
export function useRenderRunner() {
    const [busy, setBusy] = useState(false)
    const [status, setStatus] = useState('')
    const [result, setResult] = useState<RenderResult | null>(null)
    const [report, setReport] = useState<GraphicsReport | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    useWakeLock(busy)

    useEffect(() => () => abortRef.current?.abort(), [])

    const reset = (): void => {
        if (result) URL.revokeObjectURL(result.url)
        setResult(null)
        setReport(null)
    }

    /** `prepare` builds the request (graphics need fonts and the logo); `long` asks for notification permission first. */
    const run = async (prepare: () => Promise<RenderRequest>, long: boolean): Promise<void> => {
        if (long) askNotifyPermission() // inside the click
        reset()
        setBusy(true)
        setStatus('Preparing…')
        const controller = new AbortController()
        abortRef.current = controller
        const t0 = Date.now()
        try {
            const req = await prepare()
            const out = await renderReel(req.cuts, req.sources, {
                onProgress: (p) => setStatus(formatRenderProgress(p)),
                signal: controller.signal,
                outputName: req.outputName,
                ...(req.resumable ? { resumable: req.resumable } : {}),
                ...(req.graphics ? { graphics: req.graphics, onGraphics: setReport } : {}),
            })
            const file = new File([out], req.outputName, { type: 'video/mp4' })
            setResult({ url: URL.createObjectURL(file), file })
            const ms = Date.now() - t0
            setStatus(`Done in ${Math.max(1, Math.round(ms / 1000))} s`)
            if (req.reencodeSec && req.reencodeSec > 0) useAppState.getState().noteReencodeSpeed(ms / 1000 / req.reencodeSec)
            if (ms >= NOTIFY_AFTER_MS) notifyIfHidden('Render finished', `${req.outputName} is ready to download`)
        } catch (e) {
            const cancelled = e instanceof DOMException && e.name === 'AbortError'
            setStatus(cancelled ? 'Render cancelled' : `Render failed: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            abortRef.current = null
            setBusy(false)
        }
    }

    const cancel = (): void => abortRef.current?.abort()
    return { busy, status, setStatus, result, report, setReport, run, cancel }
}

/** An unfinished render of this kind saved by an earlier session (re-read after every render). */
export function useSavedJob(kind: JobKind, busy: boolean): { job: JobState | null; discard: () => Promise<void> } {
    const [job, setJob] = useState<JobState | null>(null)
    useEffect(() => {
        if (busy) return
        let live = true
        void loadJob().then((j) => { if (live) setJob(j && j.kind === kind && j.unitsDone > 0 ? j : null) })
        return () => { live = false }
    }, [kind, busy])
    const discard = async (): Promise<void> => { await discardJob(); setJob(null) }
    return { job, discard }
}
