import { useAppState } from '../state'
import { finalScore, formatScore } from '../utils/score'
import { isOver, raisedScore, scoreGap } from '../utils/scoreGap'
import { raiseFinalScore } from './raiseFinalScore'

/** Quiet inline "Update to 14–9" button, only while the tagged goals are over the known final score. Sets the final score to that. */
export function UpdateScoreLink() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)
    if (!known || teams.length < 2) return null
    const tagged = finalScore(events, teams)
    if (!isOver(scoreGap(tagged, known))) return null
    return <button type="button" className="update-score" onClick={raiseFinalScore}>Update to {formatScore(raisedScore(tagged, known))}</button>
}
