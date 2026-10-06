import type { JobState } from '../render/renderJob'

interface ResumeOfferProps {
    job: JobState
    /** The job can carry on: same plan and files as now. */
    matches: boolean
    filesLoaded: boolean
    busy: boolean
    onResume: () => void
    onDiscard: () => void
}

/** An unfinished render saved before a reload: resume it, or say why it can only start again. */
export function ResumeOffer({ job, matches, filesLoaded, busy, onResume, onDiscard }: ResumeOfferProps) {
    const pct = Math.round((job.done / (job.total || 1)) * 100)
    return (
        <div className="resume-offer" role="region" aria-label="Unfinished render">
            {matches ? (
                <>
                    <p>An unfinished render of <b>{job.outputName}</b> stopped at {pct}%.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-primary" disabled={busy} onClick={onResume}>Resume render</button>
                        <button type="button" className="btn-quiet" disabled={busy} onClick={onDiscard}>Discard</button>
                    </div>
                </>
            ) : (
                <>
                    <p>
                        {filesLoaded
                            ? <>An unfinished render of <b>{job.outputName}</b> ({pct}%) can’t be resumed: the files or the plan changed. Rendering starts again.</>
                            : <>An unfinished render of <b>{job.outputName}</b> ({pct}%) is waiting for its videos: relink them to resume.</>}
                    </p>
                    <div><button type="button" className="btn-quiet" disabled={busy} onClick={onDiscard}>Discard</button></div>
                </>
            )}
        </div>
    )
}
