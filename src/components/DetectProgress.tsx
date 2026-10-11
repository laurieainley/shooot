import { cancelDetection, startDetection, useDetectJob } from '../detectJobs'
import { openFindGoals } from './findGoals'
import { listeningLine } from '../utils/voice'

const NO_VIDEO = 'Load the match videos first.'

/** Why the run failed, with Try again; shown above any suggestions already there. */
export function DetectFailed() {
    const error = useDetectJob((s) => s.error)
    return (
        <div className="review__status" role="alert">
            <p className="m-0">{error === NO_VIDEO ? error : `Couldn't read the audio: ${error}`}</p>
            <button type="button" className="btn-quiet review__btn" onClick={() => startDetection()}>Try again</button>
        </div>
    )
}

/** Find goals while it runs: a progress bar (the sheet announces phase changes, not every percent). */
export function DetectProgress() {
    const fraction = useDetectJob((s) => s.fraction)
    const percent = Math.round(fraction * 100)
    return (
        <div className="review__status">
            <p className="m-0">{listeningLine(fraction)}</p>
            <div className="review__bar" role="progressbar" aria-label="Find goals progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <div style={{ width: `${percent}%` }} />
            </div>
            <button type="button" className="btn-quiet review__btn" onClick={() => cancelDetection()}>Cancel</button>
        </div>
    )
}

/** Nothing (current) to review: the run was cancelled, never started, or the videos changed since it. Offer to start. */
export function DetectIdle({ cancelled, stale = false }: { cancelled?: boolean; stale?: boolean }) {
    return (
        <div className="review__status">
            {stale && <p className="m-0">The videos changed since the last Find goals.</p>}
            {cancelled && <p className="m-0">Find goals was cancelled.</p>}
            <button type="button" className="btn-quiet review__btn" onClick={() => openFindGoals(true)}>Find goals</button>
        </div>
    )
}
