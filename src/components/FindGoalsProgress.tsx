import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { reopenReview, useSuggestionsCurrent } from './findGoals'
import { setReviewDismissed, useDismissedRun } from './reviewDismiss'
import { showToast } from '../toasts'
import { reviewRailLabel } from '../utils/reviewLanes'
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
        <div className="find-progress flex items-center gap-2 px-3 py-1 text-ui-xs text-muted" data-testid="find-progress">
            <span className="min-w-0 flex-1">{progress.line}</span>
            <button type="button" className="btn-quiet review__btn" onClick={() => useAppState.getState().openPanel('review')}>Open</button>
        </div>
    )
}

/** After the review was closed with suggestions left: a quiet way back in. */
export function ReviewRailButton() {
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const panel = useAppState((s) => s.panel)
    const phase = useDetectJob((s) => s.phase)
    const current = useSuggestionsCurrent()
    const runAt = useAppState((s) => s.suggestionRun?.createdAt ?? null)
    const dismissed = useDismissedRun()
    if (panel === 'review' || phase === 'running' || !current || (runAt !== null && dismissed === runAt)) return null
    const dismiss = (): void => {
        if (runAt === null) return
        setReviewDismissed(runAt)
        showToast('Review moments hidden', { label: 'Undo', run: () => setReviewDismissed(null) })
    }
    const label = reviewRailLabel(suggestions, new Set(events.map((e) => e.id)))
    if (!label) return null
    return (
        <div className="find-progress review-rail px-3 py-1">
            <button type="button" className="btn-quiet review__btn" onClick={reopenReview}>{label}</button>
            <button type="button" className="btn-quiet review-rail__dismiss" aria-label="Dismiss" title="Dismiss (the moments stay on the strip and in ⋯)" onClick={dismiss}>×</button>
        </div>
    )
}
