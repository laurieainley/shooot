import { useMemo } from 'react'
import type { Suggestion } from '../types'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import { showToast } from '../toasts'
import { globalToFileTime } from '../utils/matchStrip'
import { momentAfter, momentAt, momentPosition } from '../utils/foundMoments'
import { discardedCopy, matchClock } from '../utils/toastCopy'
import { jumpStartSec, pendingMoments } from '../utils/tagView'
import { pausePlayer } from './playerControl'
import { useSuggestionsCurrent } from './findGoals'

/** Seeks to 6 s before a found moment and plays (no replay loop: ⟲5 replays). */
export function jumpToMoment(moment: Suggestion): void {
    const st = useAppState.getState()
    const durations = st.files.map((f) => f.durationSec ?? 0)
    const at = globalToFileTime(st.cumulativeOffsets, durations, jumpStartSec(moment))
    st.seekToGoal(at.fileIndex, Math.round(at.timeSec * 10) / 10)
}

const pendingNow = (): Suggestion[] => {
    const st = useAppState.getState()
    return pendingMoments(st.suggestions, new Set(st.events.map((e) => e.id)))
}

/** ✕ Not a goal: rejects the moment (undoable), then on to the next pending one, or pause when none is left. */
export function rejectMoment(moment: Suggestion): void {
    const st = useAppState.getState()
    st.decideSuggestion(moment.id, { kind: 'reject' })
    const clock = matchClock(moment.globalTimeSec, selectMatchStartSec(st), selectClockLong(st))
    showToast(discardedCopy(clock), { label: 'Undo', run: () => { useAppState.getState().undoDiscard(moment.id) } })
    const next = momentAfter(pendingNow(), moment.globalTimeSec)
    if (next) jumpToMoment(next)
    else pausePlayer()
}

/** The pending found moment under the playhead, with its place among all found moments; null off a moment or off the run. */
export function useCurrentMoment(): { moment: Suggestion; index: number; total: number } | null {
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const current = useSuggestionsCurrent()
    // Whole seconds: the window does not need a re-render for every time update.
    const nowSec = useAppState((s) => Math.floor((s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec))
    return useMemo(() => {
        if (!current) return null
        const moment = momentAt(pendingMoments(suggestions, new Set(events.map((e) => e.id))), nowSec)
        const pos = moment ? momentPosition(suggestions, moment.id) : null
        return moment && pos ? { moment, ...pos } : null
    }, [suggestions, events, current, nowSec])
}
