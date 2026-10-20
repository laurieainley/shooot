import { useAppState } from '../state'
import { showToast } from '../toasts'
import { finalScore, formatScore } from '../utils/score'
import { raisedScore } from '../utils/scoreGap'

/** The score "Update to …" would set: per team the larger of the known and tagged goals; null when nothing is over. */
export function raiseTarget(): ReturnType<typeof raisedScore> | null {
    const { events, teams, knownFinalScore } = useAppState.getState()
    if (!knownFinalScore || teams.length < 2) return null
    return raisedScore(finalScore(events, teams), knownFinalScore)
}

/** Sets the known final score to the raised score, with a toast whose Undo puts the old score back. */
export function raiseFinalScore(): void {
    const { knownFinalScore, setKnownFinalScore } = useAppState.getState()
    const next = raiseTarget()
    if (!knownFinalScore || !next) return
    setKnownFinalScore(next)
    showToast(`Final score updated to ${formatScore(next)}`, { label: 'Undo', run: () => useAppState.getState().setKnownFinalScore(knownFinalScore) })
}
