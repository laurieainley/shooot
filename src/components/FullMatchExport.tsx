import { useMemo, useState } from 'react'
import { useAppState } from '../state'
import { useShallow } from 'zustand/react/shallow'
import { fullMatchExport, type ExportState } from '../utils/exportPlans'
import { formatBytes, fullMatchSpan, PHONE_SIZE_WARNING } from '../utils/fullMatch'
import { globalToFileTime } from '../utils/matchStrip'
import { finalWhistleSec, kickOffSec } from '../utils/matchClock'
import { formatReelLength } from '../utils/reel'
import { linkedEvents } from '../utils/relink'
import type { RenderQuality } from '../utils/renderSources'
import { MAX_INTERVAL_MIN, MIN_INTERVAL_MIN, type ScoreBugMode } from '../utils/scoreBug'
import { formatHMS } from '../utils/timeline'
import { MissingFullFiles } from './MissingFullFiles'
import { RenderStatus } from './RenderStatus'
import { ResumeOffer } from './ResumeOffer'
import { startExport } from './renderRequest'
import { useRenderJobs } from '../renderJobs'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'
import { useSavedJob } from './useSavedJob'

const BUG_MODES: [ScoreBugMode, string][] = [['off', 'Off'], ['goals', 'After goals'], ['periodic', 'Periodic']]
const INTERVALS = Array.from({ length: MAX_INTERVAL_MIN - MIN_INTERVAL_MIN + 1 }, (_, i) => i + MIN_INTERVAL_MIN)

/** Export full match: every file end to end from Kick off to Final whistle, stream copied, with optional cards and score bug. */
export function FullMatchExport() {
    // Only what the plan reads (not the playhead), so the panel does not recompute while the video plays.
    const st = useAppState(useShallow((s): ExportState => ({
        files: s.files, events: s.events, cumulativeOffsets: s.cumulativeOffsets, adjustTimestampsByOffset: s.adjustTimestampsByOffset,
        lengthBeforeGoalSec: s.lengthBeforeGoalSec, lengthAfterGoalSec: s.lengthAfterGoalSec, replayBeforeSec: s.replayBeforeSec,
        replayAfterSec: s.replayAfterSec, replaySpeed: s.replaySpeed, graphics: s.graphics, teams: s.teams, matchdayLabel: s.matchdayLabel,
        fullMatch: s.fullMatch,
    })))
    const setFullMatch = useAppState((s) => s.setFullMatch)
    const { files, events, cumulativeOffsets, fullMatch } = st
    const phone = useMediaQuery(COARSE_QUERY)
    const busy = useRenderJobs((s) => s.job?.phase === 'running')
    const saved = useSavedJob('fullMatch', busy)
    const [note, setNote] = useState<string | null>(null)
    const [missing, setMissing] = useState<string[]>([])

    const plan = useMemo(() => fullMatchExport(st, 'full'), [st])
    const linked = linkedEvents(events)
    const durations = files.map((f) => f.durationSec ?? 0)
    const span = fullMatchSpan(linked, cumulativeOffsets, durations)
    const where = (t: number): string => `V${globalToFileTime(cumulativeOffsets, durations, t).fileIndex + 1}`
    const hasKickOff = linked.some((e) => e.type === 'kick_off')
    const hasWhistle = finalWhistleSec(linked, cumulativeOffsets) !== null
    const from = hasKickOff ? `Kick off ${formatHMS(kickOffSec(linked, cumulativeOffsets))} (${where(span.startSec)})` : 'Start of V1'
    const to = hasWhistle ? `Final whistle ${formatHMS(span.endSec)} (${where(Math.max(0, span.endSec - 0.001))})` : `End of V${files.length}`
    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = plan.cuts.length === 0

    const run = (quality: RenderQuality): void => {
        const p = fullMatchExport(useAppState.getState(), quality)
        if (p.missing.length > 0) { setMissing(p.missing); return }
        setMissing([])
        startExport('fullMatch', quality, p, true)
    }
    const job = saved.job
    const matchingQuality = job ? (['full', 'preview'] as const).find((q) => fullMatchExport(useAppState.getState(), q).signature === job.signature) : undefined

    if (files.length === 0) return <p className="m-0 text-[13px] text-muted">Load the match videos first.</p>

    return (
        <div className="flex flex-col gap-2">
            <div className="full-match-summary">
                <p className="m-0"><b>{from} → {to}</b></p>
                <p className="m-0 tc text-muted">{formatReelLength(plan.seconds)} · about {formatBytes(plan.bytes)} · stream copied, not re-encoded</p>
                {(!hasKickOff || !hasWhistle) && <p className="m-0 text-muted">Mark Kick off (K) and Final whistle (W) to trim the warm-up and the end.</p>}
            </div>
            {phone && plan.bytes > PHONE_SIZE_WARNING && (
                <p role="alert" className="export-note">This file will be over 2 GB ({formatBytes(plan.bytes)}): make sure the phone has room, or render the preview from the LRVs.</p>
            )}

            <label className="toggle-row">
                <input type="checkbox" checked={fullMatch.cards} onChange={(e) => setFullMatch({ cards: e.target.checked })} />
                <span className="toggle-row__text">Title &amp; full-time cards<span className="toggle-row__hint">VS card before kick-off, final score after the whistle</span></span>
            </label>
            <fieldset className="segmented-field">
                <legend>Score bug</legend>
                <div className="segmented" role="radiogroup" aria-label="Score bug">
                    {BUG_MODES.map(([mode, label]) => (
                        <label key={mode} className="segmented__option">
                            <input type="radio" name="full-match-bug" value={mode} checked={fullMatch.scoreBug === mode} onChange={() => setFullMatch({ scoreBug: mode })} />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
                {fullMatch.scoreBug === 'periodic' && (
                    <label className="segmented-field__interval">
                        <span>every</span>
                        <select aria-label="Show the score every" className="field" value={fullMatch.intervalMin} onChange={(e) => setFullMatch({ intervalMin: Number(e.target.value) })}>
                            {INTERVALS.map((m) => <option key={m} value={m}>{m} min</option>)}
                        </select>
                    </label>
                )}
                <span className="toggle-row__hint">
                    {fullMatch.scoreBug === 'off' ? 'No score on screen.'
                        : fullMatch.scoreBug === 'goals' ? '10 s after each goal.'
                        : '8 s at kick-off and after half time, 10 s after goals, 5 s on the interval.'} Only those moments are re-encoded.
                </span>
            </fieldset>

            {job && (
                <ResumeOffer job={job} matches={!!matchingQuality} filesLoaded={files.length > 0} busy={busy}
                    onResume={() => run(matchingQuality!)} onDiscard={() => void saved.discard()} />
            )}
            {hasProxies && (
                <button type="button" onClick={() => run('preview')} disabled={disabled} className="btn-quiet w-full justify-center">Preview full match (LRV)</button>
            )}
            <button type="button" onClick={() => run('full')} disabled={disabled} className="btn-primary w-full justify-center">
                {hasProxies ? 'Render full match (full quality)' : 'Render full match'}
            </button>
            <MissingFullFiles missing={missing} onChange={(m, msg) => { setMissing(m); setNote(msg) }} onPreviewInstead={() => run('preview')} />
            {note && <p role="note" className="m-0 text-[12px] text-muted">{note}</p>}
            <RenderStatus kind="fullMatch" />
        </div>
    )
}
