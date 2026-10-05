import { useMemo } from 'react'
import { useAppState } from '../state'
import { finalScore, formatScore, scoreAt } from '../utils/score'

interface ScoreBadgeProps {
    compact?: boolean
}

/**
 * Score at the playhead in Match-setup team order, scoreboard style: dot, name, digits in a recessed panel.
 * The final score follows in brackets when it differs (i.e. there are goals still to come).
 */
export function ScoreBadge({ compact = false }: ScoreBadgeProps) {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const playhead = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const now = useMemo(() => scoreAt(events, teams, offsets, playhead), [events, teams, offsets, playhead])
    const final = useMemo(() => finalScore(events, teams), [events, teams])

    if (teams.length < 2 || teams.every((t) => !t.name.trim())) return null
    const [a, b] = teams
    const differs = now[0] !== final[0] || now[1] !== final[1]
    const line = `${a.name} ${formatScore(now)} ${b.name}${differs ? ` (final ${formatScore(final)})` : ''}`

    return (
        <div role="status" aria-label="Score" title={line} className="score-badge">
            <span className="team-dot" style={{ background: a.color }} />
            {!compact && <span className="score-name">{a.name}</span>}
            <span className="scoreboard tc">{now[0]}<span className="score-sep">–</span>{now[1]}</span>
            {!compact && <span className="score-name">{b.name}</span>}
            <span className="team-dot" style={{ background: b.color }} />
            {differs && <span className="score-final tc">({formatScore(final)})</span>}
        </div>
    )
}
