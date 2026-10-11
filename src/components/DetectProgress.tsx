import { cancelDetection, startDetection, useDetectJob } from '../detectJobs'
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
