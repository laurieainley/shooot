import type { MatchEvent, Team } from '../types'
import { teamBadge } from '../graphics/teamStyle'
import { formatClock } from './timeline'
import { finalScore, formatScore, scoreAt } from './score'

export interface ScorebugSide {
    initials: string
    color: string
}

export interface ScorebugModel {
    left: ScorebugSide
    right: ScorebugSide
    score: string
    /** Time since Kick off (mm:ss), or null before it / without one. */
    clock: string | null
    /** Full team names and the score (with the final when goals are still to come), for the tooltip and screen readers. */
    label: string
}

interface ScorebugInput {
    teams: Team[]
    events: MatchEvent[]
    offsets: number[]
    /** Playhead on the whole timeline. */
    playheadSec: number
    clockLong: boolean
}

/** What the on-video score bug shows at the playhead; null until Match setup has two named teams. */
export function scorebugModel({ teams, events, offsets, playheadSec, clockLong }: ScorebugInput): ScorebugModel | null {
    if (teams.length < 2 || teams.every((t) => !t.name.trim())) return null
    const [a, b] = teams
    const now = scoreAt(events, teams, offsets, playheadSec)
    const final = finalScore(events, teams)
    const differs = now[0] !== final[0] || now[1] !== final[1]
    const ko = events.find((e) => e.type === 'kick_off' && !e.unlinked)
    const since = ko ? playheadSec - ((offsets[ko.sourceFileIndex ?? 0] ?? 0) + ko.matchTimeSec) : -1
    const side = (t: Team): ScorebugSide => ({ initials: teamBadge(t).initials, color: t.color })
    return {
        left: side(a),
        right: side(b),
        score: formatScore(now),
        clock: since >= 0 ? formatClock(since, clockLong) : null,
        label: `${a.name} ${formatScore(now)} ${b.name}${differs ? ` (final ${formatScore(final)})` : ''}`,
    }
}
