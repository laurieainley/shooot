import type { JobState } from '../render/renderJob'
import { usePartsSave } from '../prepare/partsSave'

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
export function ResumeOffer({ job, matches, filesLoaded, busy: rendering, onResume, onDiscard }: ResumeOfferProps) {
    // Like Render: no resuming while a prepared parts file is being saved (it points at the cache's parts).
    const saving = usePartsSave((s) => s.phase === 'saving')
    const busy = rendering || saving
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
