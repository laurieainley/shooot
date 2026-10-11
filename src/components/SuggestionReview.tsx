import { useRef, useState, type ReactNode } from 'react'
import type { KeepType, Suggestion } from '../types'
import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { firstToReviewInLane, laneCounts, laneNeighbour, laneSwitchVisible, positionInLane, type Lane } from '../utils/reviewLanes'
import { NO_TOP_PICKS } from '../utils/voice'
import { LaneSwitch } from './LaneSwitch'
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
    const [pickedLane, setPickedLane] = useState<Lane>('all')
    const allIndex = useRef(0) // where you were in All while Top picks is open
    const go = (i: number): void => useAppState.getState().setReviewIndex(i)
    const runCurrent = useSuggestionsCurrent()
    const stale = suggestions.length > 0 && !runCurrent
    const rangeStep = useRangeStep()
    const failed = phase === 'failed'
    const switchShown = laneSwitchVisible(ballPhase, suggestions) && suggestions.length > 0 && !rangeStep && !stale && phase !== 'running'
    const lane: Lane = switchShown ? pickedLane : 'all'
    const counts = laneCounts(suggestions)
    const current = index < suggestions.length ? suggestions[index] : null
    const selectLane = (next: Lane): void => {
        if (next === lane) return
        if (lane === 'all') allIndex.current = index
        setPickedLane(next)
        if (next === 'top') { const first = firstToReviewInLane(suggestions, 'top', ids); if (first >= 0) go(first) }
        else go(Math.min(allIndex.current, suggestions.length))
    }
    const emptyTop = lane === 'top' && counts.top === 0
    const announce = phase === 'running' ? 'Listening for goals.' : phase === 'done' ? 'Find goals finished.' : phase === 'cancelled' ? 'Find goals stopped.' : ''
    return (
        <ColumnPanel label="Suggested goals" onClose={onClose} className="review" badge={<BetaTag />}>
            <p className="sr-only" role="status" aria-live="polite">{announce}</p>
            {switchShown && <LaneSwitch lane={lane} counts={counts} onSelect={selectLane} />}
            {rangeStep && phase !== 'running' ? <MatchRangeStep /> : null}
            {failed && !rangeStep && <DetectFailed />}
            {ballPhase === 'running' && <BallProgress />}
            {ballPhase === 'failed' && <BallFailed />}
            {rangeStep && phase !== 'running' ? null : phase === 'running' ? <DetectProgress /> : stale ? <DetectIdle stale />
                : emptyTop ? <p className="review__note m-0" role="status">{ballPhase === 'running' ? 'No top picks yet — still checking the goal mouths.' : NO_TOP_PICKS}</p>
                : current
                    ? <SuggestionCard suggestion={current} index={Math.max(0, positionInLane(suggestions, lane, index))} total={counts[lane === 'top' ? 'top' : 'all']}
                        {...ballProps(current)}
                        onNext={() => go(laneNeighbour(suggestions, lane, index, 1) ?? suggestions.length)}
                        onSaved={() => go(laneNeighbour(suggestions, lane, index, 1, ids) ?? suggestions.length)}
                        onPrev={() => go(laneNeighbour(suggestions, lane, index, -1) ?? index)} />
                    : suggestions.length === 0 && (phase === 'cancelled' || phase === 'idle')
                        ? <DetectIdle cancelled={phase === 'cancelled'} />
                        : failed && suggestions.length === 0 ? null : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}

/** The Labs ball hint and the Goal pre-selection for a suggestion the ball was seen on (the team is left to the user). */
function ballProps(s: Suggestion): { hint?: ReactNode; preselectType?: KeepType } {
    if (!s.ball) return {}
    return { hint: <><span className="tag rv__toppick">Top pick</span> Ball seen in a goal mouth</>, preselectType: 'goal' }
}
