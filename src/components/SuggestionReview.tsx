import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { effectiveStatus } from '../utils/suggestions'
import { BetaTag } from './BetaTag'
import { ColumnPanel } from './ColumnPanel'
import { DetectFailed, DetectIdle, DetectProgress } from './DetectProgress'
import { useSuggestionsCurrent } from './findGoals'
import { SuggestionCard } from './SuggestionCard'
import { SuggestionSummary } from './SuggestionSummary'

interface SuggestionReviewProps { onClose: () => void }

/** Find goals (Beta): progress while listening, then one suggestion at a time, then the summary. */
export function SuggestionReview({ onClose }: SuggestionReviewProps) {
    const phase = useDetectJob((s) => s.phase)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const index = useAppState((s) => s.reviewIndex)
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
            {phase === 'running' ? <DetectProgress /> : stale ? <DetectIdle stale />
                : current
                    ? <SuggestionCard suggestion={current} index={index} total={suggestions.length}
                        onNext={() => go(nextPending(index + 1))} onPrev={() => go(Math.max(0, index - 1))} />
                    : suggestions.length === 0 && (phase === 'cancelled' || phase === 'idle')
                        ? <DetectIdle cancelled={phase === 'cancelled'} />
                        : failed && suggestions.length === 0 ? null : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}
