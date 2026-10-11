import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useAppState } from '../state'
import { getDetectJob, startDetection } from '../detectJobs'
import { fileKeys } from '../utils/fileKey'
import { firstPendingIndex, runMatchesFiles } from '../utils/suggestions'
import { finalWhistleSec, kickOffSec, markerGlobalSec } from '../utils/matchClock'

/** False when the videos changed since the last Find goals (its suggestions then no longer apply). */
export function useSuggestionsCurrent(): boolean {
    const files = useAppState((s) => s.files)
    const run = useAppState((s) => s.suggestionRun)
    return runMatchesFiles(run, fileKeys(files))
}

// The "match start and end" step before a new Find goals run (UI-only, never persisted).
const rangeStep = createStore<{ open: boolean }>(() => ({ open: false }))
export const useRangeStep = (): boolean => useStore(rangeStep, (s) => s.open)
export const setRangeStep = (open: boolean): void => rangeStep.setState({ open })

/** Kick off and Final whistle are both tagged (so Find goals can start straight away). */
export function hasMatchRange(): boolean {
    const { events, cumulativeOffsets } = useAppState.getState()
    return markerGlobalSec(events, cumulativeOffsets, 'kick_off') !== null && markerGlobalSec(events, cumulativeOffsets, 'final_whistle') !== null
}

/** Both markers set and the whistle after kick off. */
export function rangeIsValid(events: Parameters<typeof kickOffSec>[0], offsets: number[]): boolean {
    const fw = finalWhistleSec(events, offsets)
    return markerGlobalSec(events, offsets, 'kick_off') !== null && fw !== null && fw > kickOffSec(events, offsets)
}

/** Menu / empty state: start the analysis unless there is something to review (or it is already running), then open the panel at the first pending suggestion. */
export function openFindGoals(again = false): void {
    const st = useAppState.getState()
    const current = runMatchesFiles(st.suggestionRun, fileKeys(st.files))
    setRangeStep(false)
    if (again || (st.suggestions.length === 0 && getDetectJob().phase !== 'running')) {
        if (hasMatchRange()) startDetection()
        else setRangeStep(true)
    } else if (current) st.setReviewIndex(firstPendingIndex(st.suggestions, new Set(st.events.map((e) => e.id))))
    st.openPanel('review')
}
