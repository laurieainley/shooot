import { useEffect, useRef, useState } from 'react'
import type { JobKind } from '../render/renderJob'
import { renderJobs, useRenderJobs } from '../renderJobs'
import { loadLastReport } from '../render/diagnostics'
import { REEL_READY, POLISHING } from '../utils/voice'
import { CopyDiagnostics } from './CopyDiagnostics'
import { NetBulge } from './NetBulge'
import { keepOpenNotice } from '../utils/renderNotice'
import { dedupeSkipped } from '../utils/dedupeSkipped'
import { SkippedList } from './SkippedList'
import { useLayout } from './useMediaQuery'
import { etaSeconds, formatEta, stepEta, type EtaState } from '../utils/renderEta'
import { expectedWallSeconds } from '../utils/renderTime'

interface RenderStatusProps {
    /** Which export this panel section belongs to: it shows that render, and notes when the other one is running. */
    kind: JobKind
}

const STOPPED_NOTE_MS = 5000
const NAMES: Record<JobKind, string> = { highlights: 'highlights', fullMatch: 'full match', clip: 'clip' }

/** "Reused 6 of 9 parts from your last export": what the unit cache saved this render. */
export const reusedLine = (r: { units: number; of: number }): string => `Reused ${r.units} of ${r.of} parts from your last export`

/** The render's progress, Cancel (confirmed in place; once confirmed the box goes at once), skipped graphics, and the downloaded file. */
export function RenderStatus({ kind }: RenderStatusProps) {
    const stopping = useRenderJobs((s) => s.stopping)
    const queued = useRenderJobs((s) => s.queued)
    const [stopped, setStopped] = useState(false)
    useEffect(() => {
        if (!stopped) return
        const t = setTimeout(() => setStopped(false), STOPPED_NOTE_MS)
        return () => clearTimeout(t)
    }, [stopped])
    const note = stopping ? 'Stopping render…' : stopped ? 'Render stopped' : ''
    return (
        <>
            <RenderStatusBody kind={kind} onStopped={() => setStopped(true)} />
            {queued ? <p role="status" className="render-stopping export-hint">Stopping the previous export… yours starts as soon as it has stopped.</p>
                : stopping && <p className="render-stopping export-hint">Stopping the export…</p>}
            {note && <span role="status" className="sr-only">{note}</span>}
        </>
    )
}

function RenderStatusBody({ kind, onStopped }: RenderStatusProps & { onStopped: () => void }) {
    const job = useRenderJobs((s) => s.job)
    const conflict = useRenderJobs((s) => s.conflict)
    const layout = useLayout()
    const phone = layout === 'phone' || layout === 'landscape'
    const [confirming, setConfirming] = useState(false)
    const [, tick] = useState(0)
    // The last render's report, kept across reloads (the engine saves it when a render ends).
    // Read again whenever a run ends or stops: a failed or cancelled run replaces the last report too.
    const stopping = useRenderJobs((s) => s.stopping)
    const stored = job || stopping ? null : loadLastReport()
    useEffect(() => { if (job?.phase !== 'running') setConfirming(false) }, [job?.phase])
    const eta = useRef<{ id: number; state: EtaState | null }>({ id: -1, state: null })
    useEffect(() => {
        if (job?.phase !== 'running') return
        const t = setInterval(() => {
            const j = renderJobs().getState().job
            if (j) {
                if (eta.current.id !== j.id) eta.current = { id: j.id, state: null }
                eta.current.state = stepEta(eta.current.state, Date.now(), j.fraction, j.estimateSec ? expectedWallSeconds(j.estimateSec, j.output ?? 'original') : null)
            }
            tick((n) => n + 1)
        }, 1000)
        return () => clearInterval(t)
    }, [job?.phase])
    const etaText = job && job.phase === 'running' && eta.current.id === job.id ? formatEta(etaSeconds(eta.current.state)) : null

    const jobs = renderJobs().getState()
    const keepRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (!confirming) return
        keepRef.current?.focus()
        const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); setConfirming(false) } }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [confirming])
    const stop = (): void => { setConfirming(false); jobs.cancel(); onStopped() }
    /** The whole box: its message, or (after Cancel) a one-line "Stop at 42%?" in the same place. */
    const busyBox = (message: string, pct?: string) => (
        <div className="render-busy render-busy--active" role={confirming ? 'group' : undefined} aria-label={confirming ? 'Stop the render?' : undefined}>
            {confirming ? (
                <>
                    <span className="render-busy__text">Stop at {Math.round((job?.fraction ?? 0) * 100)}%?</span>
                    <span className="render-busy__actions">
                        <button type="button" className="btn-quiet render-busy__btn" onClick={stop}>Stop</button>
                        <button type="button" ref={keepRef} className="btn-quiet render-busy__btn" onClick={() => setConfirming(false)}>Keep going</button>
                    </span>
                </>
            ) : (
                <>
                    <span className="render-busy__text" data-pct={pct}>{message}</span>
                    <span className="render-busy__actions">
                        <button type="button" className="btn-quiet render-busy__btn" onClick={() => setConfirming(true)}>Cancel</button>
                    </span>
                </>
            )}
        </div>
    )

    if (job && job.kind !== kind) {
        if (job.phase !== 'running') return null
        return (
            busyBox(`Rendering ${NAMES[job.kind]} · ${Math.round(job.fraction * 100)}%${conflict ? ' — one render at a time: cancel it to start this one.' : ''}`)
        )
    }
    if (!job) {
        if (!stored || stored.kind !== kind) return null
        return (
            <>
                <SkippedList skipped={dedupeSkipped(stored.graphics.skipped)} note={`from the last render, ${new Date(stored.finishedAt ?? stored.startedAt).toLocaleString()}`} />
                <CopyDiagnostics report={stored} />
            </>
        )
    }
    const canShare = job.result != null && typeof navigator.canShare === 'function' && !job.result.savedTo && navigator.canShare({ files: [job.result.file] })
    const skipped = dedupeSkipped(job.report?.skipped ?? job.diagnostics?.graphics.skipped ?? [])
    if (job.phase === 'running' && job.notice) {
        return (
            <div className="render-busy" role="alertdialog" aria-label="Different frame sizes">
                <p className="m-0">{job.notice}</p>
                <span className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn-primary" onClick={() => jobs.answerNotice(true)}>Render</button>
                    <button type="button" className="btn-quiet" onClick={() => jobs.answerNotice(false)}>Cancel</button>
                </span>
            </div>
        )
    }
    return (
        <>
            {job.phase === 'running' && busyBox(`${keepOpenNotice(navigator)}${conflict ? ' One render at a time.' : ''}`, `${Math.round(job.fraction * 100)}%`)}
            {job.phase === 'running' && phone && <p className="export-hint m-0">Keep the screen on, the tab open and the device plugged in.</p>}
            {etaText && <p className="export-hint m-0" aria-label="Time left">{etaText}</p>}
            {job.reused && job.reused.units > 0 && job.phase !== 'failed' && <p className="export-hint m-0">{reusedLine(job.reused)}</p>}
            {job.phase === 'running' && <p className="render-voice voice-heading">{POLISHING}</p>}
            <div role="status" className="tc export-hint">{job.phase === 'failed' ? `Render failed: ${job.error}` : job.status}</div>
            <SkippedList skipped={skipped} />
            {job.result && (
                <div className="render-done">
                    <p className="render-ready"><NetBulge mode="once" size={40} />
                        <span className="render-ready__text">
                            <span className="voice-heading">{REEL_READY}</span>
                            {/* What happened to the file, as a sentence: not a pill next to the buttons, where it read like one. */}
                            <span className="render-ready__file">{job.result.savedTo ? 'Saved to' : job.result.downloaded ? 'Downloading' : 'Ready to download:'} <span className="tc">{job.result.savedTo ?? job.result.file.name}</span></span>
                        </span>
                    </p>
                    {!job.result.savedTo && <a href={job.result.url} download={job.result.file.name} className={job.result.downloaded ? 'btn-quiet no-underline' : 'btn-primary no-underline'}
                        onClick={(e) => { e.preventDefault(); jobs.downloadAgain() }}>
                        {job.result.downloaded ? 'Download again' : 'Download'}
                    </a>}
                    {canShare && (
                        <button type="button" onClick={() => navigator.share({ files: [job.result!.file] }).catch(() => undefined)} className="btn-quiet">Share</button>
                    )}
                </div>
            )}
            {job.diagnostics && job.phase !== 'running' && <CopyDiagnostics report={job.diagnostics} />}
        </>
    )
}
