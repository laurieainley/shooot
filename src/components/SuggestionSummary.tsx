import { useState } from 'react'
import { useAppState } from '../state'
import { AUDIO_DETECT } from '../detect/detectConfig'
import { getDetectJob } from '../detectJobs'
import { detectionReport, reviewCounts, type BallReport } from '../utils/suggestions'
import { keptSummary, LOW_KEEP_NOTE, NOTHING_STOOD_OUT } from '../utils/voice'
import { finalScore } from '../utils/score'
import { extraText, missingText, scoreGap } from '../utils/scoreGap'
import { openFindGoals } from './findGoals'

interface SuggestionSummaryProps { onClose: () => void }

const showDevTools = (): boolean => import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'))
/** The health check needs enough decisions to mean something. */
const MIN_DECIDED = 5

/** After the review: how many were kept, a health note when very few were, diagnostics and running it again. */
export function SuggestionSummary({ onClose }: SuggestionSummaryProps) {
    const suggestions = useAppState((s) => s.suggestions)
    const run = useAppState((s) => s.suggestionRun)
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)
    const gap = teams.length >= 2 ? scoreGap(finalScore(events, teams), known) : null
    const missing = gap ? gap.missing[0] + gap.missing[1] : 0
    const extra = gap ? gap.extra[0] + gap.extra[1] : 0
    const counts = reviewCounts(suggestions, new Set(events.map((e) => e.id)))
    const decided = counts.kept + counts.rejected
    const ballSeen = suggestions.filter((s) => s.ball).length
    // null: nothing copied yet; text is set when copying failed, so it can be selected by hand.
    const [copy, setCopy] = useState<{ ok: boolean; text: string } | null>(null)
    const [details, setDetails] = useState(false) // Copy diagnostics / scores: for reporting a problem, not part of the summary
    const doCopy = async (text: string): Promise<void> => {
        try {
            if (!navigator.clipboard?.writeText) throw new Error('No clipboard')
            await navigator.clipboard.writeText(text)
            setCopy({ ok: true, text })
        } catch {
            setCopy({ ok: false, text })
        }
    }
    /** The ball check part of the report: only once phase 2 has finished or failed. */
    const ballReport = (): BallReport | null => {
        const j = getDetectJob()
        if (j.ballPhase === 'failed') return { error: j.ballDetail ? `${j.ballError} (${j.ballDetail})` : j.ballError ?? 'failed' }
        if (j.ballPhase === 'done') return { ep: j.ballEp, ms: j.ballMs, tagged: ballSeen }
        return null
    }
    return (
        <div className="review__summary">
            {counts.total === 0 ? <p className="m-0">{NOTHING_STOOD_OUT}</p> : <p className="m-0 review__kept">{keptSummary(counts.kept, counts.total, ballSeen)}</p>}
            {gap?.complete && <p className="m-0 review__note">All goals tagged.</p>}
            {gap && missing > 0 && <p className="m-0 review__note">{missingText(gap, teams)}. {counts.pending > 0 ? 'Look through the other moments, or tag them while watching.' : 'Tag them while watching.'}</p>}
            {gap && extra > 0 && <p className="m-0 review__note msg-warn">{extraText(gap, teams)}.</p>}
            {counts.pending > 0 && <p className="m-0 review__note">{counts.pending} not reviewed.</p>}
            {decided >= MIN_DECIDED && counts.kept / decided < AUDIO_DETECT.lowKeepRatio && <p className="m-0 review__note">{LOW_KEEP_NOTE}</p>}
            <div className="review__nav">
                <button type="button" className="btn-quiet review__btn" onClick={() => openFindGoals(true)}>Find goals again</button>
                <button type="button" className="btn-primary review__btn" onClick={onClose}>Done</button>
            </div>
            <button type="button" className="link-btn review__details-toggle" aria-expanded={details} onClick={() => setDetails(!details)}>Details</button>
            {details && (
                <div className="review__nav">
                    <button type="button" className="btn-quiet review__btn" onClick={() => void doCopy(detectionReport(run, counts, ballReport()))}>Copy diagnostics</button>
                    {showDevTools() && (
                        <button type="button" className="btn-quiet review__btn" onClick={() => {
                            const sc = getDetectJob().scores
                            void doCopy(JSON.stringify({ hopSec: AUDIO_DETECT.hopSec, scores: sc ? Array.from(sc, (v) => Math.round(v * 100) / 100) : [] }))
                        }}>Copy scores</button>
                    )}
                </div>
            )}
            {copy && <p className="m-0 review__note" role="status">{copy.ok ? 'Copied.' : "Couldn't copy — select and copy the text below."}</p>}
            {copy && !copy.ok && <textarea className="review__copy" readOnly rows={4} aria-label="Text to copy" value={copy.text} onFocus={(e) => e.currentTarget.select()} />}
        </div>
    )
}
