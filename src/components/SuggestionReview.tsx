import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { effectiveStatus } from '../utils/suggestions'
import { BetaTag } from './BetaTag'
import { ColumnPanel } from './ColumnPanel'
import { DetectProgress } from './DetectProgress'
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
    const busy = phase === 'running' || phase === 'failed'
    return (
        <ColumnPanel label="Suggested goals" onClose={onClose} className="review">
            <h3 className="review__title">Suggested goals <BetaTag /></h3>
            {busy ? <DetectProgress /> : current
                ? <SuggestionCard suggestion={current} index={index} total={suggestions.length}
                    onNext={() => go(nextPending(index + 1))} onPrev={() => go(Math.max(0, index - 1))} />
                : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}
