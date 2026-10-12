import { useAppState } from '../state'
import { finalScore } from '../utils/score'
import { extraText, scoreGap, toFindText } from '../utils/scoreGap'

/**
 * Goals tagged so far over the whole match, same scoring as the scorebug and the full-time card (the scorebug only shows the score at the playhead).
 * With a known final score it also says what is left to find.
 */
export function GoalsTally() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)
    if (teams.length < 2) return null
    const [a, b] = finalScore(events, teams)
    const gap = scoreGap([a, b], known)
    const base = `Goals tagged: ${teams[0].name} ${a}, ${teams[1].name} ${b}`
    const over = gap ? gap.extra[0] + gap.extra[1] > 0 : false
    const short = gap ? gap.missing[0] + gap.missing[1] > 0 : false
    const label = !gap || !known ? base
        : gap.complete ? `${base}. All goals tagged.`
            : `${base}. Final score ${teams[0].name} ${known[0]}, ${teams[1].name} ${known[1]}.${short ? ` ${toFindText(gap)}.` : ''}${over ? ` ${extraText(gap, teams)}.` : ''}`
    return (
        <p className="tally m-0" role="group" aria-label={label}>
            <span className="tally__label">Goals tagged:</span>{' '}
            <span className="tally__team voice-shirt" aria-hidden="true">{teams[0].name}</span>{' '}
            <span className="tally__score tc" aria-hidden="true">{a} – {b}</span>{' '}
            <span className="tally__team voice-shirt" aria-hidden="true">{teams[1].name}</span>
            {gap && known && (
                <span className="tally__target" aria-hidden="true">
                    {gap.complete ? '✓ All goals tagged' : <>
                        Final <span className="tc">{known[0]} – {known[1]}</span>
                        {short && <> · {toFindText(gap)}</>}
                        {over && <> · <span className="msg-warn">{extraText(gap, teams)}</span></>}
                    </>}
                </span>
            )}
        </p>
    )
}
