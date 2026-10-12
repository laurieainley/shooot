import { useAppState } from '../state'
import { finalScore } from '../utils/score'

/** Goals tagged so far over the whole match, same scoring as the scorebug and the full-time card (the scorebug only shows the score at the playhead). */
export function GoalsTally() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    if (teams.length < 2) return null
    const [a, b] = finalScore(events, teams)
    return (
        <p className="tally m-0" role="group" aria-label={`Goals tagged: ${teams[0].name} ${a}, ${teams[1].name} ${b}`}>
            <span className="tally__label">Goals tagged:</span>{' '}
            <span className="tally__team voice-shirt" aria-hidden="true">{teams[0].name}</span>{' '}
            <span className="tally__score tc" aria-hidden="true">{a} – {b}</span>{' '}
            <span className="tally__team voice-shirt" aria-hidden="true">{teams[1].name}</span>
        </p>
    )
}
