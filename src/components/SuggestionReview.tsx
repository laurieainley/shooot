import { useRef, useState, type ReactNode } from 'react'
import type { KeepType, Suggestion } from '../types'
import { useAppState } from '../state'
import { showToast } from '../toasts'
import { useDetectJob } from '../detectJobs'
import { TOP_PICKS_DONE, defaultLane, firstPendingInLane, firstToReviewInLane, laneCounts, laneNeighbour, laneSwitchVisible, positionInLane, type Lane } from '../utils/reviewLanes'
import { NO_TOP_PICKS } from '../utils/voice'
import { GoalsTally } from './GoalsTally'
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
    // Opens where the review is: the lane of the current suggestion (Top picks first by default), else Other moments.
    const [pickedLane, setPickedLane] = useState<Lane>(() => {
        const st = useAppState.getState()
        const cur = st.suggestions[st.reviewIndex]
        return cur ? (cur.ball ? 'top' : 'other') : defaultLane(st.suggestions, new Set(st.events.map((e) => e.id)))
    })
    const lastIn = useRef<Partial<Record<Lane, number>>>({}) // where you were in each lane while the other is open
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
        lastIn.current[lane] = index
        setPickedLane(next)
        const back = lastIn.current[next]
        const first = firstToReviewInLane(suggestions, next, ids)
        if (back !== undefined && back < suggestions.length) go(back)
        else if (first >= 0) go(first)
    }
    const freshIds = (): ReadonlySet<string> => new Set(useAppState.getState().events.map((e) => e.id))
    /** Past the last Top pick: on to the first other moment still to review (the only automatic lane switch). */
    const leaveTopPicks = (): void => {
        const st = useAppState.getState()
        const first = firstPendingInLane(st.suggestions, 'other', freshIds())
        lastIn.current.top = index
        setPickedLane('other')
        go(first >= 0 ? first : st.suggestions.length)
        showToast(TOP_PICKS_DONE)
    }
    /** Confirm / Discard: the next one still to review in the lane; finishing Top picks moves on to the other moments. */
    const afterDecision = (): void => {
        const st = useAppState.getState()
        const fresh = freshIds()
        const next = laneNeighbour(st.suggestions, lane, index, 1, fresh)
        if (next !== null) { go(next); return }
        if (lane === 'top') {
            const earlier = firstPendingInLane(st.suggestions, 'top', fresh)
            if (earlier >= 0) go(earlier)
            else leaveTopPicks()
            return
        }
        go(st.suggestions.length)
    }
    const afterNext = (): void => {
        const next = laneNeighbour(suggestions, lane, index, 1)
        if (next !== null) go(next)
        else if (lane === 'top' && switchShown) leaveTopPicks()
        else go(suggestions.length)
    }
    const emptyTop = lane === 'top' && counts.top === 0
    const emptyOther = lane === 'other' && counts.other === 0
    const announce = phase === 'running' ? 'Listening for goals.' : phase === 'done' ? 'Find goals finished.' : phase === 'cancelled' ? 'Find goals stopped.' : ''
    return (
        <ColumnPanel label="Suggested goals" onClose={onClose} className="review" badge={<BetaTag />}>
            <p className="sr-only" role="status" aria-live="polite">{announce}</p>
            {suggestions.length > 0 && !rangeStep && !stale && phase !== 'running' && <GoalsTally />}
            {switchShown && <LaneSwitch lane={lane} counts={counts} onSelect={selectLane} />}
            {rangeStep && phase !== 'running' ? <MatchRangeStep /> : null}
            {failed && !rangeStep && <DetectFailed />}
            {ballPhase === 'running' && <BallProgress />}
            {ballPhase === 'failed' && <BallFailed />}
            {rangeStep && phase !== 'running' ? null : phase === 'running' ? <DetectProgress /> : stale ? <DetectIdle stale />
                : emptyTop ? <p className="review__note m-0" role="status">{ballPhase === 'running' ? 'No top picks yet — still checking the goal mouths.' : NO_TOP_PICKS}</p>
                : emptyOther ? <p className="review__note m-0" role="status">No other moments.</p>
                : current
                    ? <SuggestionCard suggestion={current} index={Math.max(0, positionInLane(suggestions, lane, index))} total={counts[lane]}
                        {...ballProps(current)}
                        onNext={afterNext}
                        onSaved={afterDecision}
                        onPrev={() => go(laneNeighbour(suggestions, lane, index, -1) ?? index)} />
                    : suggestions.length === 0 && (phase === 'cancelled' || phase === 'idle')
                        ? <DetectIdle cancelled={phase === 'cancelled'} />
                        : failed && suggestions.length === 0 ? null : <SuggestionSummary onClose={onClose} />}
        </ColumnPanel>
    )
}

/** The Goal pre-selection for a suggestion the ball was seen on (the team is left to the user; being in Top picks is the hint). */
function ballProps(s: Suggestion): { hint?: ReactNode; preselectType?: KeepType } {
    return s.ball ? { preselectType: 'goal' } : {}
}
