import { useMemo, useState } from 'react'
import { useSavedTimeline } from '../renderTimelines'
import { fullMatchExport, highlightsExport, planOutput, type ExportState } from '../utils/exportPlans'
import { useAppState } from '../state'
import { INTRO_SEC } from '../graphics/layout'
import { fullMatchDescription, highlightsDescription } from '../utils/descriptions'
import { goalscorersText } from '../utils/goalscorers'
import { linkedEvents } from '../utils/relink'
import { resolveHighlightsQuality } from '../utils/outputQuality'
import { useLayout } from './useMediaQuery'

interface DescriptionCopyProps {
    /** Which video the description is for. */
    kind: 'highlights' | 'fullMatch'
}

/** Copies a YouTube description (score, chapters, scorers) for one of the exports, or just the goalscorers. */
export function DescriptionCopy({ kind }: DescriptionCopyProps) {
    const hasEvents = useAppState((s) => linkedEvents(s.events).length > 0)
    const [copied, setCopied] = useState<string | null>(null)
    const saved = useSavedTimeline(kind)
    // Real times only while the plan is the one that was rendered (either quality); otherwise they are estimates.
    const exactFor = (st: ExportState) => {
        if (!saved) return null
        const plan = kind === 'highlights' ? highlightsExport : fullMatchExport
        // Stream copy, either re-encode, or the preview: the render's signature includes its output quality.
        const tries = [['full', undefined], ['full', planOutput('4k')], ['full', planOutput('1080p')], ['preview', undefined]] as const
        return tries.some(([q, o]) => plan(st, q, o).signature === saved.signature) ? saved.timeline : null
    }
    // Only the fields an export plan reads (not playback time), so this does not recompute while the video plays.
    const files = useAppState((s) => s.files), events = useAppState((s) => s.events), offsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec), after = useAppState((s) => s.lengthAfterGoalSec)
    const replayBefore = useAppState((s) => s.replayBeforeSec), replayAfter = useAppState((s) => s.replayAfterSec), replaySpeed = useAppState((s) => s.replaySpeed)
    const graphics = useAppState((s) => s.graphics), teams = useAppState((s) => s.teams), matchday = useAppState((s) => s.matchdayLabel)
    const quality = useAppState((s) => s.highlightsQuality)
    const layout = useLayout()
    // Highlights re-encoded (4K / 1080p) cut exactly; the estimate has no key-frame slack then.
    const reencoded = kind === 'highlights' ? resolveHighlightsQuality(quality, layout === 'phone' || layout === 'landscape') !== 'original' : false
    const fullMatch = useAppState((s) => s.fullMatch), goalAreas = useAppState((s) => s.goalAreas)
    const estimated = useMemo(() => {
        if (events.length === 0) return false
        const st: ExportState = {
            files, events, cumulativeOffsets: offsets, lengthBeforeGoalSec: before, lengthAfterGoalSec: after,
            replayBeforeSec: replayBefore, replayAfterSec: replayAfter, replaySpeed, graphics, teams, matchdayLabel: matchday, fullMatch, goalAreas,
        }
        return exactFor(st) === null
        // eslint-disable-next-line react-hooks/exhaustive-deps -- exactFor only reads `saved` and `kind`
    }, [files, events, offsets, before, after, replayBefore, replayAfter, replaySpeed, graphics, teams, matchday, fullMatch, goalAreas, saved, kind])

    const copy = async (label: string, make: () => string): Promise<void> => {
        await navigator.clipboard.writeText(make())
        setCopied(label)
        setTimeout(() => setCopied(null), 1500)
    }
    const description = (): string => {
        const st = useAppState.getState()
        const args = {
            events: st.events, teams: st.teams, cumulativeOffsets: st.cumulativeOffsets,
            before: st.lengthBeforeGoalSec, after: st.lengthAfterGoalSec,
            replay: { beforeSec: st.replayBeforeSec, afterSec: st.replayAfterSec, speed: st.replaySpeed },
            durationsSec: st.files.map((f) => f.durationSec),
            fullMatchReplays: st.fullMatch.replays,
            timeline: exactFor(st),
            reencoded: kind === 'highlights' ? reencoded : st.fullMatch.quality !== 'original',
            introSec: (kind === 'highlights' ? highlightsExport : fullMatchExport)(st, 'full').spec?.intro ? INTRO_SEC : 0,
        }
        return kind === 'highlights' ? highlightsDescription(args) : fullMatchDescription(args)
    }
    const label = kind === 'highlights' ? 'highlights description' : 'full match description'

    return (
        <>
            <div className="share-step__actions share-step__actions--below">
                {/* "Copy description" fits beside Copy goalscorers in the drawer; the full name stays for screen readers. */}
                <button type="button" disabled={!hasEvents} onClick={() => copy('Description', description)} className="btn-quiet" aria-label={`Copy ${label}`}>
                    Copy description
                </button>
                <button type="button" disabled={!hasEvents}
                    onClick={() => copy('Goalscorers', () => { const st = useAppState.getState(); return goalscorersText(st.events, st.teams) })}
                    className="btn-quiet">
                    Copy goalscorers
                </button>
            </div>
            {(estimated || copied) && (
                <div className="share-step__note">
                    {estimated && <span className="export-hint">Times are estimates until you render.</span>}
                    {copied && <span role="status" className="export-hint">{copied} copied</span>}
                </div>
            )}
        </>
    )
}
