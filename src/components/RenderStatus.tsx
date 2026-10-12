import { useEffect, useRef, useState } from 'react'
import type { JobKind } from '../render/renderJob'
import { renderJobs, useRenderJobs } from '../renderJobs'
import { loadLastReport } from '../render/diagnostics'
import { REEL_READY, POLISHING } from '../utils/voice'
import { CopyDiagnostics } from './CopyDiagnostics'
import { NetBulge } from './NetBulge'
import { keepOpenNotice } from '../utils/renderNotice'

interface RenderStatusProps {
    /** Which export this panel section belongs to: it shows that render, and notes when the other one is running. */
    kind: JobKind
}

const STOPPED_NOTE_MS = 5000
const dedupe = (skipped: { label: string; reason: string }[]): { label: string; reason: string }[] => [...new Map(skipped.map((g) => [`${g.label}|${g.reason}`, g])).values()]
const NAMES: Record<JobKind, string> = { highlights: 'highlights', fullMatch: 'full match', clip: 'clip' }

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
            {queued && <p className="render-stopping m-0 text-[12px] text-muted">Stopping the previous render… yours starts next.</p>}
            {note && <span role="status" className="sr-only">{note}</span>}
        </>
    )
}

function RenderStatusBody({ kind, onStopped }: RenderStatusProps & { onStopped: () => void }) {
    const job = useRenderJobs((s) => s.job)
    const conflict = useRenderJobs((s) => s.conflict)
    const [confirming, setConfirming] = useState(false)
    const [, tick] = useState(0)
    // The last render's report, kept across reloads (the engine saves it when a render ends).
    const [stored] = useState(() => loadLastReport())
    useEffect(() => { if (job?.phase !== 'running') setConfirming(false) }, [job?.phase])
    useEffect(() => {
        if (job?.phase !== 'running') return
        const t = setInterval(() => tick((n) => n + 1), 1000)
        return () => clearInterval(t)
    }, [job?.phase])

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
                <SkippedList skipped={dedupe(stored.graphics.skipped)} note={`from the last render, ${new Date(stored.finishedAt ?? stored.startedAt).toLocaleString()}`} />
                <CopyDiagnostics report={stored} />
            </>
        )
    }
    const canShare = job.result != null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [job.result.file] })
    const skipped = dedupe(job.report?.skipped ?? job.diagnostics?.graphics.skipped ?? [])
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
            {job.phase === 'running' && <p className="render-voice voice-heading">{POLISHING}</p>}
            <div role="status" className="tc text-[12px] text-muted">{job.phase === 'failed' ? `Render failed: ${job.error}` : job.status}</div>
            <SkippedList skipped={skipped} />
            {job.result && (
                <div className="render-done">
                    <p className="render-ready"><NetBulge mode="once" size={40} />
                        <span className="render-ready__text">
                            <span className="voice-heading">{REEL_READY}</span>
                            {/* What happened to the file, as a sentence: not a pill next to the buttons, where it read like one. */}
                            <span className="render-ready__file">{job.result.downloaded ? 'Downloading' : 'Ready to download:'} <span className="tc">{job.result.file.name}</span></span>
                        </span>
                    </p>
                    <a href={job.result.url} download={job.result.file.name} className={job.result.downloaded ? 'btn-quiet no-underline' : 'btn-primary no-underline'}
                        onClick={(e) => { e.preventDefault(); jobs.downloadAgain() }}>
                        {job.result.downloaded ? 'Download again' : 'Download'}
                    </a>
                    {canShare && (
                        <button type="button" onClick={() => navigator.share({ files: [job.result!.file] }).catch(() => undefined)} className="btn-quiet">Share</button>
                    )}
                </div>
            )}
            {job.diagnostics && job.phase !== 'running' && <CopyDiagnostics report={job.diagnostics} />}
        </>
    )
}

function SkippedList({ skipped, note }: { skipped: { label: string; reason: string }[]; note?: string }) {
    if (skipped.length === 0) return null
    return (
        <div className="rounded border border-line p-2 text-[12px] text-muted">
            <p className="m-0 mb-1">Rendered without:{note && <span className="font-normal"> ({note})</span>}</p>
            <ul className="m-0 list-disc pl-4">
                {skipped.map((g, i) => <li key={i}>{g.label} — {g.reason}</li>)}
            </ul>
        </div>
    )
}
