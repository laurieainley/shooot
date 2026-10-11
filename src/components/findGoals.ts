import { useAppState } from '../state'
import { getDetectJob, startDetection } from '../detectJobs'
import { fileKeys } from '../utils/fileKey'
import { firstPendingIndex, runMatchesFiles } from '../utils/suggestions'

/** False when the videos changed since the last Find goals (its suggestions then no longer apply). */
export function useSuggestionsCurrent(): boolean {
    const files = useAppState((s) => s.files)
    const run = useAppState((s) => s.suggestionRun)
    return runMatchesFiles(run, fileKeys(files))
}

/** Menu / empty state: start the analysis unless there is something to review (or it is already running), then open the panel at the first pending suggestion. */
export function openFindGoals(again = false): void {
    const st = useAppState.getState()
    const current = runMatchesFiles(st.suggestionRun, fileKeys(st.files))
    if (again || (st.suggestions.length === 0 && getDetectJob().phase !== 'running')) startDetection()
    else if (current) st.setReviewIndex(firstPendingIndex(st.suggestions, new Set(st.events.map((e) => e.id))))
    st.openPanel('review')
}
