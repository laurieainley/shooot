import type { ReactNode } from 'react'
import type { KeepType, Suggestion } from '../types'
import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { effectiveStatus } from '../utils/suggestions'
import { BetaTag } from './BetaTag'
import { ColumnPanel } from './ColumnPanel'
import { BallFailed, BallProgress, DetectFailed, DetectIdle, DetectProgress } from './DetectProgress'
import { useRangeStep, useSuggestionsCurrent } from './findGoals'
import { MatchRangeStep } from './MatchRangeStep'
import { SuggestionCard } from './SuggestionCard'
import { SuggestionSummary } from './SuggestionSummary'

interface SuggestionReviewProps { onClose: () => void }

/** Find goals (Beta): progress while listening, then one suggestion at a time, then the summary. */
export function SuggestionReview({ onClose }: SuggestionReviewProps) {
    const phase = useDetectJob((s) => s.phase)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const index = useAppState((s) => s.reviewIndex)
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
    const rangeStep = useRangeStep()
    const labs = useAppState((s) => s.labs)
    const hasMarks = useAppState((s) => !!(s.goalMarks?.team1 || s.goalMarks?.team2))
    const needMarks = labs && !hasMarks && !rangeStep && phase !== 'running' && !stale && (phase === 'done' || suggestions.length > 0)
    const failed = phase === 'failed'
    const announce = phase === 'running' ? 'Listening for goals.' : phase === 'done' ? 'Find goals finished.' : phase === 'cancelled' ? 'Find goals stopped.' : ''
    return (
        <ColumnPanel label="Suggested goals" onClose={onClose} className="review" badge={<BetaTag />}>
            <p className="sr-only" role="status" aria-live="polite">{announce}</p>
            {rangeStep && phase !== 'running' ? <MatchRangeStep /> : null}
            {failed && !rangeStep && <DetectFailed />}
            {needMarks && (
                <div className="review__status">
                    <p className="review__note m-0">Mark the goals in Match setup to also check the goal mouths.</p>
                    <button type="button" className="btn-quiet review__btn" onClick={() => useAppState.getState().openPanel('match')}>Open Match setup</button>
                </div>
            )}
            {ballPhase === 'running' && <BallProgress />}
            {ballPhase === 'failed' && <BallFailed />}
            {rangeStep && phase !== 'running' ? null : phase === 'running' ? <DetectProgress /> : stale ? <DetectIdle stale />
                : current
                    ? <SuggestionCard suggestion={current} index={index} total={suggestions.length}
                        {...ballProps(current)}
                        onNext={() => go(index + 1)} onSaved={() => go(nextPending(index + 1))} onPrev={() => go(Math.max(0, index - 1))} />
                    : suggestions.length === 0 && (phase === 'cancelled' || phase === 'idle')
                        ? <DetectIdle cancelled={phase === 'cancelled'} />
                        : failed && suggestions.length === 0 ? null : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}

/** The Labs ball hint and the Goal pre-selection for a suggestion the ball was seen on (the team is left to the user). */
function ballProps(s: Suggestion): { hint?: ReactNode; preselectType?: KeepType } {
    if (!s.ball) return {}
    return { hint: <>Ball seen in a goal mouth</>, preselectType: 'goal' }
}
