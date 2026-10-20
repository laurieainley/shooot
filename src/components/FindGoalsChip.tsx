import { useAppState } from '../state'
import { useDetectJob } from '../detectJobs'
import { findGoalsProgress } from '../utils/findGoalsProgress'
import { findGoalsChip } from '../utils/foundMoments'
import { AiTag } from './AiTag'
import { openFindGoals, useSuggestionsCurrent } from './findGoals'
import { useTagUi } from './tagView'

/**
 * The touch view's Find goals status: "Find goals" + AI before a run, the percent while it runs, what is left to check once
 * it found moments, then "All found moments checked". Tapping opens the start form / progress / summary as a sheet.
 */
export function FindGoalsChip() {
    const suggestions = useAppState((s) => s.suggestions)
    const events = useAppState((s) => s.events)
    const current = useSuggestionsCurrent()
    const running = findGoalsProgress(useDetectJob((j) => j))
    const poke = useTagUi((s) => s.poke)
    const chip = findGoalsChip({ running: running?.percent ?? null, current, suggestions, eventIds: new Set(events.map((e) => e.id)) })
    return (
        <button type="button" className={`control-btn tv-chip tv-chip--${chip.state}`} aria-label={chip.state === 'idle' ? 'Find goals' : `Find goals: ${chip.label}`}
            onPointerDown={poke} onClick={() => openFindGoals()}>
            {chip.state === 'found' && <span className="tv-chip__star" aria-hidden="true">★</span>}
            <span>{chip.label}</span>
            {chip.state === 'idle' && <AiTag />}
        </button>
    )
}

/** A thin line along the timeline while Find goals runs (touch view). */
export function FindGoalsLine() {
    const running = findGoalsProgress(useDetectJob((j) => j))
    if (!running) return null
    return <div className="tv-findline" role="progressbar" aria-label="Find goals progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={running.percent}><div style={{ width: `${running.percent}%` }} /></div>
}
