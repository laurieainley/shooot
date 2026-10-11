import { cancelDetection, startDetection, useDetectJob } from '../detectJobs'
import { openFindGoals } from './findGoals'
import { listeningLine } from '../utils/voice'

const NO_VIDEO = 'Load the match videos first.'

/** Find goals while it runs, or why it failed. */
export function DetectProgress() {
    const phase = useDetectJob((s) => s.phase)
    const fraction = useDetectJob((s) => s.fraction)
    const error = useDetectJob((s) => s.error)
    if (phase === 'failed') {
        return (
            <div className="review__status" role="alert">
                <p className="m-0">{error === NO_VIDEO ? error : `Couldn't read the audio: ${error}`}</p>
                <button type="button" className="btn-quiet review__btn" onClick={() => startDetection()}>Try again</button>
            </div>
        )
    }
    return (
        <div className="review__status" role="status" aria-live="polite">
            <p className="m-0">{listeningLine(fraction)}</p>
            <div className="review__bar" aria-hidden="true"><div style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
            <button type="button" className="btn-quiet review__btn" onClick={() => cancelDetection()}>Cancel</button>
        </div>
    )
}

/** Nothing to review because the run was cancelled (or never started): say so and offer to start. */
export function DetectIdle({ cancelled }: { cancelled: boolean }) {
    return (
        <div className="review__status">
            {cancelled && <p className="m-0">Find goals was cancelled.</p>}
            <button type="button" className="btn-quiet review__btn" onClick={() => openFindGoals(true)}>Find goals</button>
        </div>
    )
}
