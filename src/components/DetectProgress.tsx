import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { cancelDetection, startDetection, useDetectJob } from '../detectJobs'
import { openFindGoals } from './findGoals'
import { checkingGoalsLine, listeningLine } from '../utils/voice'

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

/** Labs ball check while it runs behind the review: same style as the audio line; the review stays usable. */
export function BallProgress() {
    const fraction = useDetectJob((s) => s.ballFraction)
    const percent = Math.round(fraction * 100)
    return (
        <div className="review__status">
            <p className="m-0">{checkingGoalsLine(fraction)}</p>
            <div className="review__bar" role="progressbar" aria-label="Ball check progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <div style={{ width: `${percent}%` }} />
            </div>
            <button type="button" className="btn-quiet review__btn" onClick={() => cancelDetection()}>Cancel</button>
        </div>
    )
}

/** Why the ball check did not finish: a plain line; the audio suggestions are untouched. */
export function BallFailed() {
    const error = useDetectJob((s) => s.ballError)
    return <p className="review__note m-0" role="status">{error}</p>
}

/** Nothing (current) to review: the run was cancelled, never started, or the videos changed since it. Offer to start. */
export function DetectIdle({ cancelled, stale = false }: { cancelled?: boolean; stale?: boolean }) {
    const hasOld = useAppState((s) => s.suggestions.length > 0)
    const [confirming, setConfirming] = useState(false)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => { if (confirming) dialogRef.current?.focus() }, [confirming])
    if (stale && hasOld && confirming) {
        return (
            <div ref={dialogRef} tabIndex={-1} role="alertdialog" aria-label="Clear old suggestions" className="review__status">
                <p className="m-0">The videos changed since the last Find goals. Clear the old suggestions and look for goals in these videos?</p>
                <button type="button" className="btn-primary review__btn" onClick={() => { useAppState.getState().clearSuggestions(); startDetection() }}>Clear and find goals</button>
                <button type="button" className="btn-quiet review__btn" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
        )
    }
    return (
        <div className="review__status">
            {stale && <p className="m-0">The videos changed since the last Find goals.</p>}
            {cancelled && <p className="m-0">Find goals was cancelled.</p>}
            <button type="button" className="btn-quiet review__btn" onClick={() => (stale && hasOld ? setConfirming(true) : openFindGoals(true))}>Find goals</button>
        </div>
    )
}
