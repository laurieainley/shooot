import { useAppState } from '../state'
import { AUDIO_DETECT } from '../detect/detectConfig'
import { getDetectJob } from '../detectJobs'
import { detectionReport, reviewCounts } from '../utils/suggestions'
import { keptSummary, LOW_KEEP_NOTE, NOTHING_STOOD_OUT } from '../utils/voice'
import { openFindGoals } from './findGoals'

interface SuggestionSummaryProps { onClose: () => void }

const showDevTools = (): boolean => import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'))

/** After the review: how many were kept, a health note when very few were, diagnostics and running it again. */
export function SuggestionSummary({ onClose }: SuggestionSummaryProps) {
    const suggestions = useAppState((s) => s.suggestions)
    const run = useAppState((s) => s.suggestionRun)
    const events = useAppState((s) => s.events)
    const counts = reviewCounts(suggestions, new Set(events.map((e) => e.id)))
    const copy = (text: string): void => { void navigator.clipboard?.writeText(text) }
    return (
        <div className="review__summary">
            {counts.total === 0 ? <p className="m-0">{NOTHING_STOOD_OUT}</p> : <p className="m-0 review__kept">{keptSummary(counts.kept, counts.total)}</p>}
            {counts.total >= 5 && counts.kept / counts.total < AUDIO_DETECT.lowKeepRatio && <p className="m-0 review__note">{LOW_KEEP_NOTE}</p>}
            <div className="review__nav">
                <button type="button" className="btn-quiet review__btn" onClick={() => copy(detectionReport(run, counts))}>Copy diagnostics</button>
                {showDevTools() && (
                    <button type="button" className="btn-quiet review__btn" onClick={() => {
                        const sc = getDetectJob().scores
                        copy(JSON.stringify({ hopSec: AUDIO_DETECT.hopSec, scores: sc ? Array.from(sc, (v) => Math.round(v * 100) / 100) : [] }))
                    }}>Copy scores</button>
                )}
                <button type="button" className="btn-quiet review__btn" onClick={() => openFindGoals(true)}>Find goals again</button>
                <button type="button" className="btn-primary review__btn" onClick={onClose}>Done</button>
            </div>
        </div>
    )
}
