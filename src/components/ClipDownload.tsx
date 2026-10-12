import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import { renderJobs, useRenderJobs } from '../renderJobs'
import { clipExport } from '../utils/exportPlans'
import { wantsReplay } from '../utils/replays'
import { FloatingPanel } from './FloatingPanel'
import { startExport } from './renderRequest'
import { CopyDiagnostics } from './CopyDiagnostics'
import { SkippedList, dedupe } from './RenderStatus'

export interface ClipDownloadProps {
    event: MatchEvent
}

/** The action row's Download: a small popover (Score / Replay, remembered) that renders this event as its own clip. */
export function ClipDownload({ event }: ClipDownloadProps) {
    const [open, setOpen] = useState(false)
    // Set when a clip render was started from this popover, so only that job's state is shown here.
    // Opens upwards when there is not room under the button (landscape phones, rows near the bottom of the rail).
    const [placement, setPlacement] = useState<'below' | 'above'>('below')
    const [mine, setMine] = useState(false)
    const anchorRef = useRef<HTMLButtonElement>(null)
    const clipOptions = useAppState((s) => s.clipOptions)
    const twoTeams = useAppState((s) => s.teams.length >= 2)
    const job = useRenderJobs((s) => s.job)
    const running = job?.phase === 'running'
    const canReplay = wantsReplay(event)
    const opts = { score: twoTeams && clipOptions.score, replay: canReplay && clipOptions.replay }
    const ownJob = mine && job?.kind === 'clip' ? job : null

    const files = useAppState((s) => s.files)
    const previewOnly = useMemo(
        () => open && !event.unlinked && !!clipExport(useAppState.getState(), event.id, { score: opts.score, replay: opts.replay }, 'full')?.missing.length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open, event, files, opts.score, opts.replay],
    )

    const reason = running && !ownJob ? 'A render is in progress' : event.unlinked ? 'Relink the file first' : null

    const toggle = (): void => {
        const r = anchorRef.current?.getBoundingClientRect()
        setPlacement(r && r.height > 0 && window.innerHeight - r.bottom < 240 && r.top > window.innerHeight - r.bottom ? 'above' : 'below')
        setOpen((o) => !o)
    }

    const download = (): void => {
        const state = useAppState.getState()
        const quality = clipExport(state, event.id, opts, 'full')?.missing.length ? 'preview' : 'full'
        const plan = clipExport(state, event.id, opts, quality)
        if (!plan) return
        setMine(true)
        startExport('clip', quality, plan, false)
    }

    let status: string | null = null
    if (ownJob) {
        if (ownJob.phase === 'running') status = ownJob.notice ? null : `Rendering clip · ${Math.round(ownJob.fraction * 100)}%`
        else if (ownJob.phase === 'done' && ownJob.result) status = `${ownJob.result.downloaded ? 'Downloading' : 'Ready to download:'} ${ownJob.result.file.name}`
        else if (ownJob.phase === 'failed') status = ownJob.error ?? 'The clip could not be rendered'
    }
    const finished = ownJob != null && ownJob.phase !== 'running'
    const skipped = dedupe(ownJob?.report?.skipped ?? ownJob?.diagnostics?.graphics.skipped ?? [])
    const result = ownJob?.phase === 'done' ? ownJob.result : null
    const canShare = result != null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [result.file] })
    const jobs = renderJobs().getState()

    return (
        <>
            <button ref={anchorRef} type="button" className="act-btn" aria-label="Download clip" title="Download this clip"
                aria-expanded={open} onClick={toggle}>
                <DownloadIcon /><span className="event-actions__label">Download</span>
            </button>
            {open && (
                <FloatingPanel label="Download clip" anchorRef={anchorRef} placement={placement} onClose={() => setOpen(false)} className="clip-download">
                    <div className="clip-download__body">
                        {twoTeams && (
                            <label className="clip-download__opt">
                                <input type="checkbox" checked={clipOptions.score} onChange={(ev) => useAppState.getState().setClipOptions({ score: ev.target.checked })} /> Score
                            </label>
                        )}
                        {canReplay && (
                            <label className="clip-download__opt">
                                <input type="checkbox" checked={clipOptions.replay} onChange={(ev) => useAppState.getState().setClipOptions({ replay: ev.target.checked })} /> Replay
                            </label>
                        )}
                        {previewOnly && <p className="clip-download__note">Full-quality files aren't loaded — this clip uses the preview files.</p>}
                        {reason && <p className="clip-download__note" role="status">{reason}</p>}
                        {ownJob?.phase === 'running' && ownJob.notice && (
                            <div role="alertdialog" aria-label="Different frame sizes" className="clip-download__note">
                                <p className="m-0">{ownJob.notice}</p>
                                <span className="flex flex-wrap items-center gap-2">
                                    <button type="button" className="btn-primary" onClick={() => jobs.answerNotice(true)}>Render</button>
                                    <button type="button" className="btn-quiet" onClick={() => jobs.answerNotice(false)}>Cancel</button>
                                </span>
                            </div>
                        )}
                        {status && <p className="clip-download__note" role="status">{ownJob?.phase === 'failed' ? `Render failed: ${status}` : status}</p>}
                        {finished && <SkippedList skipped={skipped} />}
                        {!(ownJob?.phase === 'running' && ownJob.notice) && (
                            <button type="button" className="btn-primary" disabled={!!reason || ownJob?.phase === 'running'} onClick={download}>Download</button>
                        )}
                        {result && (
                            <span className="flex flex-wrap items-center gap-2">
                                <button type="button" className="btn-quiet" onClick={() => renderJobs().getState().downloadAgain()}>Download again</button>
                                {canShare && <button type="button" className="btn-quiet" onClick={() => navigator.share({ files: [result.file] }).catch(() => undefined)}>Share</button>}
                            </span>
                        )}
                        {finished && ownJob?.diagnostics && <CopyDiagnostics report={ownJob.diagnostics} />}
                    </div>
                </FloatingPanel>
            )}
        </>
    )
}

function DownloadIcon() {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M8 2v8M4.5 6.8 8 10.3l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
