import { useEffect } from 'react'
import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { pendingMoments } from '../utils/tagView'
import { AiTag } from './AiTag'
import { BallFailed, BallProgress, DetectFailed, DetectIdle, DetectProgress } from './DetectProgress'
import { useRangeStep, useSuggestionsCurrent } from './findGoals'
import { MatchRangeStep } from './MatchRangeStep'
import { Sheet } from './Sheet'
import { SuggestionSummary } from './SuggestionSummary'

interface FindGoalsSheetProps { onClose: () => void }

/**
 * Find goals on touch: a short sheet for the start form, the progress and the summary. Reviewing is watching on the timeline
 * (found moments, Tag, Not a goal), so there is no card here. Starting a run closes it so the picture is back.
 */
export function FindGoalsSheet({ onClose }: FindGoalsSheetProps) {
    const phase = useDetectJob((s) => s.phase)
    const ballPhase = useDetectJob((s) => s.ballPhase)
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const current = useSuggestionsCurrent()
    const rangeStep = useRangeStep()
    const stale = suggestions.length > 0 && !current
    const left = current ? pendingMoments(suggestions, new Set(events.map((e) => e.id))).length : 0
    useEffect(() => { if (phase === 'running') onClose() }, [phase, onClose])
    return (
        <Sheet label="Find goals" onClose={onClose} badge={<AiTag />} className="sheet--narrow find-sheet">
            {rangeStep && phase !== 'running' ? <MatchRangeStep />
                : phase === 'running' ? <DetectProgress />
                : phase === 'failed' && suggestions.length === 0 ? <DetectFailed />
                : stale ? <DetectIdle stale />
                : suggestions.length === 0 ? <DetectIdle cancelled={phase === 'cancelled'} />
                : (
                    <>
                        {phase === 'failed' && <DetectFailed />}
                        {ballPhase === 'running' && <BallProgress />}
                        {ballPhase === 'failed' && <BallFailed />}
                        {left > 0 && <p className="review__note m-0">{left} to check: use ◀ Found / Found ▶, or tap a ring on the timeline. Tag a goal to confirm it, or press Not a goal.</p>}
                        <SuggestionSummary onClose={onClose} />
                    </>
                )}
        </Sheet>
    )
}
