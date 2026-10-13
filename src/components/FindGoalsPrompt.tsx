import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { findGoalsProgress } from '../utils/findGoalsProgress'
import { reviewRailLabel } from '../utils/reviewLanes'
import { AiTag } from './AiTag'
import { openFindGoals, useSuggestionsCurrent } from './findGoals'

/**
 * Event rail nudge: with videos loaded and no goal tagged yet (scored, penalty or own goal; kick off, half time and the
 * rest don't count), a compact quiet button to try Find goals. Gone as soon as any goal exists. While a run is going or
 * suggestions wait for review, the rail already shows the live % line / "Review moments" button, so this stays out
 * of the way instead of saying it twice.
 */
export function FindGoalsPrompt() {
    const hasFiles = useAppState((s) => s.files.length > 0)
    const noGoals = useAppState((s) => !s.events.some((e) => e.type === 'goal' || e.type === 'own_goal'))
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const panel = useAppState((s) => s.panel)
    const current = useSuggestionsCurrent()
    const running = findGoalsProgress(useDetectJob((j) => j))
    if (!hasFiles || !noGoals || panel === 'review') return null
    const railLabel = current ? reviewRailLabel(suggestions, new Set(events.map((e) => e.id))) : null
    if (running || railLabel) return null
    return (
        <div className="find-prompt" data-testid="find-prompt">
            <span className="find-prompt__text">Let the app look for goals in your video.</span>
            <button type="button" className="btn-quiet empty-log__find" onClick={() => openFindGoals()}>Find goals <AiTag /></button>
        </div>
    )
}
