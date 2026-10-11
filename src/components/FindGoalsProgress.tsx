import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { findGoalsProgress } from '../utils/findGoalsProgress'

/** Find goals running in the background (review panel closed): one live line and a way back in. */
export function FindGoalsProgress() {
    const phase = useDetectJob((s) => s.phase)
    const fraction = useDetectJob((s) => s.fraction)
    const ballPhase = useDetectJob((s) => s.ballPhase)
    const ballFraction = useDetectJob((s) => s.ballFraction)
    const ballEp = useDetectJob((s) => s.ballEp)
    const panel = useAppState((s) => s.panel)
    const progress = findGoalsProgress({ phase, fraction, ballPhase, ballFraction, ballEp })
    if (!progress || panel === 'review') return null
    return (
        <div className="find-progress flex items-center gap-2 px-3 py-1 text-[13px] text-muted" data-testid="find-progress">
            <span className="min-w-0 flex-1">{progress.line}</span>
            <button type="button" className="btn-quiet review__btn" onClick={() => useAppState.getState().openPanel('review')}>Open</button>
        </div>
    )
}
