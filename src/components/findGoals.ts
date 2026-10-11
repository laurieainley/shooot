import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useAppState } from '../state'
import { getDetectJob } from '../detectJobs'
import { fileKeys } from '../utils/fileKey'
import { firstPendingIndex, runMatchesFiles } from '../utils/suggestions'
import { finalWhistleSec, kickOffSec, markerGlobalSec } from '../utils/matchClock'

/** False when the videos changed since the last Find goals (its suggestions then no longer apply). */
export function useSuggestionsCurrent(): boolean {
    const files = useAppState((s) => s.files)
    const run = useAppState((s) => s.suggestionRun)
    return runMatchesFiles(run, fileKeys(files))
}

// The start form (match start and end, Advanced detection) before a new Find goals run (UI-only, never persisted).
const rangeStep = createStore<{ open: boolean }>(() => ({ open: false }))
export const useRangeStep = (): boolean => useStore(rangeStep, (s) => s.open)
export const setRangeStep = (open: boolean): void => rangeStep.setState({ open })

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
        setRangeStep(true) // always via the start form: confirm the match range (and Advanced detection)
    } else if (current) st.setReviewIndex(firstPendingIndex(st.suggestions, new Set(st.events.map((e) => e.id))))
    st.openPanel('review')
}
