import { useAppState } from '../state'
import { getDetectJob, startDetection } from '../detectJobs'

/** Menu / empty state: start the analysis unless there is something to review (or it is already running), then open the panel. */
export function openFindGoals(again = false): void {
    const st = useAppState.getState()
    if (again || (st.suggestions.length === 0 && getDetectJob().phase !== 'running')) startDetection()
    st.openPanel('review')
}
