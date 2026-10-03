import { useMemo } from 'react'
import { useAppState } from '../state'
import { isScoring } from '../utils/eventTypes'
import { linkedEvents } from '../utils/relink'

interface ScoreBadgeProps {
    compact?: boolean
}

/** Running score in Match-setup team order, scoreboard style: dot, name, digits in a recessed panel. */
export function ScoreBadge({ compact = false }: ScoreBadgeProps) {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const score = useMemo(() => {
        const scoring = linkedEvents(events).filter(isScoring)
        return teams.map((t) => ({ ...t, goals: scoring.filter((e) => e.team === t.name).length }))
    }, [events, teams])

    if (score.length < 2 || score.every((t) => !t.name.trim())) return null
    const [a, b] = score
    const line = `${a.name} ${a.goals}–${b.goals} ${b.name}`

    return (
        <div role="status" aria-label="Score" title={line} className="score-badge">
            <span className="team-dot" style={{ background: a.color }} />
            {!compact && <span className="score-name">{a.name}</span>}
            <span className="scoreboard tc">{a.goals}<span className="score-sep">–</span>{b.goals}</span>
            {!compact && <span className="score-name">{b.name}</span>}
            <span className="team-dot" style={{ background: b.color }} />
        </div>
    )
}
