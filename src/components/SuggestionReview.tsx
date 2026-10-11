import type { ReactNode } from 'react'
import type { KeepType, Suggestion, Team } from '../types'
import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { effectiveStatus } from '../utils/suggestions'
import { BetaTag } from './BetaTag'
import { ColumnPanel } from './ColumnPanel'
import { BallFailed, BallProgress, DetectFailed, DetectIdle, DetectProgress } from './DetectProgress'
import { useSuggestionsCurrent } from './findGoals'
import { SuggestionCard } from './SuggestionCard'
import { SuggestionSummary } from './SuggestionSummary'
import { teamGoalLabel } from '../utils/attack'
import { halfTimeSec } from '../utils/matchClock'
import { scoringTeam } from '../utils/ballSampling'

interface SuggestionReviewProps { onClose: () => void }

/** Find goals (Beta): progress while listening, then one suggestion at a time, then the summary. */
export function SuggestionReview({ onClose }: SuggestionReviewProps) {
    const phase = useDetectJob((s) => s.phase)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const index = useAppState((s) => s.reviewIndex)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const ballPhase = useDetectJob((s) => s.ballPhase)
    const ids = new Set(events.map((e) => e.id))
    const nextPending = (from: number): number => {
        for (let i = from; i < suggestions.length; i++) if (effectiveStatus(suggestions[i], ids) === 'pending') return i
        return suggestions.length
    }
    const current = index < suggestions.length ? suggestions[index] : null
    const go = (i: number): void => useAppState.getState().setReviewIndex(i)
    const runCurrent = useSuggestionsCurrent()
    const stale = suggestions.length > 0 && !runCurrent
    const failed = phase === 'failed'
    const announce = phase === 'running' ? 'Listening for goals.' : phase === 'done' ? 'Find goals finished.' : phase === 'cancelled' ? 'Find goals stopped.' : ''
    return (
        <ColumnPanel label="Suggested goals" onClose={onClose} className="review" badge={<BetaTag />}>
            <p className="sr-only" role="status" aria-live="polite">{announce}</p>
            {failed && <DetectFailed />}
            {ballPhase === 'running' && <BallProgress />}
            {ballPhase === 'failed' && <BallFailed />}
            {phase === 'running' ? <DetectProgress /> : stale ? <DetectIdle stale />
                : current
                    ? <SuggestionCard suggestion={current} index={index} total={suggestions.length}
                        {...ballProps(current, teams, halfTimeSec(events, offsets))}
                        onNext={() => go(nextPending(index + 1))} onPrev={() => go(Math.max(0, index - 1))} />
                    : suggestions.length === 0 && (phase === 'cancelled' || phase === 'idle')
                        ? <DetectIdle cancelled={phase === 'cancelled'} />
                        : failed && suggestions.length === 0 ? null : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}

/** The Labs ball hint and the Goal + scoring team pre-selection for a suggestion the ball was seen on. */
function ballProps(s: Suggestion, teams: Team[], halfTime: number | null): { hint?: ReactNode; preselectTeam?: string; preselectType?: KeepType } {
    if (!s.ball) return {}
    // After half time the team defending that goal is the other one: the same swap scoringTeam uses.
    const swapped = halfTime !== null && s.globalTimeSec >= halfTime
    const defended = swapped ? (s.ball.goal === 'team1' ? 'team2' : 'team1') : s.ball.goal
    return { hint: <>Ball in {teamGoalLabel(teams, defended)}</>, preselectTeam: scoringTeam(s.ball.goal, teams, halfTime, s.globalTimeSec), preselectType: 'goal' }
}
