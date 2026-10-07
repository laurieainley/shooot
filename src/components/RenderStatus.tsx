import { useEffect, useState } from 'react'
import type { JobKind } from '../render/renderJob'
import { renderJobs, useRenderJobs } from '../renderJobs'
import { loadLastReport } from '../render/diagnostics'
import { CopyDiagnostics } from './CopyDiagnostics'

interface RenderStatusProps {
    /** Which export this panel section belongs to: it shows that render, and notes when the other one is running. */
    kind: JobKind
}

const CONFIRM_AFTER_MS = 10_000
const dedupe = (skipped: { label: string; reason: string }[]): { label: string; reason: string }[] => [...new Map(skipped.map((g) => [`${g.label}|${g.reason}`, g])).values()]
const NAMES: Record<JobKind, string> = { highlights: 'highlights', fullMatch: 'full match' }

/** The render's progress, Cancel (confirmed after 10 s), skipped graphics, and the downloaded file. */
export function RenderStatus({ kind }: RenderStatusProps) {
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
    const askCancel = (): void => {
        if (job && Date.now() - job.startedAt > CONFIRM_AFTER_MS) setConfirming(true)
        else jobs.cancel()
    }
    const cancelControls = confirming ? (
        <span role="group" aria-label="Cancel the render?" className="flex flex-wrap items-center gap-2">
            <span>Cancel at {Math.round((job?.fraction ?? 0) * 100)}%?</span>
            <button type="button" className="btn-quiet btn-danger" onClick={() => { setConfirming(false); jobs.cancel() }}>Cancel render</button>
            <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>Keep rendering</button>
        </span>
    ) : <button type="button" className="btn-quiet" onClick={askCancel}>Cancel</button>

    if (job && job.kind !== kind) {
        if (job.phase !== 'running') return null
        return (
            <div className="render-busy" role="status">
                <p className="m-0">Rendering {NAMES[job.kind]} · {Math.round(job.fraction * 100)}%{conflict ? ' — one render at a time: cancel it to start this one.' : ''}</p>
                {cancelControls}
            </div>
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
            {job.phase === 'running' && (
                <div className="render-busy">
                    <p className="m-0">Keep this screen open until the render finishes.{conflict ? ' One render at a time.' : ''}</p>
                    {cancelControls}
                </div>
            )}
            <div role="status" className="tc text-[12px] text-muted">{job.phase === 'failed' ? `Render failed: ${job.error}` : job.status}</div>
            <SkippedList skipped={skipped} />
            {job.result && (
                <div className="render-done">
                    <span>{job.result.downloaded ? `Downloaded ${job.result.file.name}` : `${job.result.file.name} is ready`}</span>
                    <a href={job.result.url} download={job.result.file.name} className={job.result.downloaded ? 'btn-quiet no-underline' : 'btn-primary no-underline'}
                        onClick={(e) => { e.preventDefault(); jobs.downloadAgain() }}>
                        {job.result.downloaded ? 'Download again' : `Download ${job.result.file.name}`}
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
