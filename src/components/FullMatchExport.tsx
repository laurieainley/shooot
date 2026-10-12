import { useMemo, useState } from 'react'
import { useAppState } from '../state'
import { useShallow } from 'zustand/react/shallow'
import { fullMatchExport, type ExportState } from '../utils/exportPlans'
import { formatBytes, PHONE_SIZE_WARNING } from '../utils/fullMatch'
import { finalWhistleSec } from '../utils/matchClock'
import { formatReelLength } from '../utils/reel'
import { linkedEvents } from '../utils/relink'
import type { RenderQuality } from '../utils/renderSources'
import { MAX_INTERVAL_MIN, MIN_INTERVAL_MIN, type ScoreBugMode } from '../utils/scoreBug'
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
        files: s.files, events: s.events, cumulativeOffsets: s.cumulativeOffsets,
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
    const hasKickOff = linked.some((e) => e.type === 'kick_off')
    const hasWhistle = finalWhistleSec(linked, cumulativeOffsets) !== null
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
                <p className="m-0"><b className="tc">{formatReelLength(plan.seconds)}</b> <span className="text-muted">· about {formatBytes(plan.bytes)}</span></p>
                {(!hasKickOff || !hasWhistle) && <p className="m-0 text-muted">Tag Kick off (K) and Final whistle (W) to trim the warm-up and the end.</p>}
            </div>
            {phone && plan.bytes > PHONE_SIZE_WARNING && (
                <p role="alert" className="export-note">This file will be over 2 GB ({formatBytes(plan.bytes)}): make sure the phone has room, or render the preview from the proxies.</p>
            )}

            <label className="toggle-row">
                <input type="checkbox" checked={fullMatch.cards} onChange={(e) => setFullMatch({ cards: e.target.checked })} />
                <span className="toggle-row__text">Title &amp; full-time cards<span className="toggle-row__hint">VS card before kick-off, final score after the whistle</span></span>
            </label>
            <label className="toggle-row">
                <input type="checkbox" checked={fullMatch.captions} onChange={(e) => setFullMatch({ captions: e.target.checked })} />
                <span className="toggle-row__text">Event captions<span className="toggle-row__hint">Who scored (and the assist) just after each goal, as in the highlights</span></span>
            </label>
            <label className="toggle-row">
                <input type="checkbox" checked={fullMatch.replays} onChange={(e) => setFullMatch({ replays: e.target.checked })} />
                <span className="toggle-row__text">Slow-mo replays<span className="toggle-row__hint">After each goal with a replay, as in the highlights</span></span>
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
                        : fullMatch.scoreBug === 'goals' ? 'Shows the new score just after each goal, as in the highlights.'
                        : 'After each goal, at kick-off and half time, and every few minutes.'}
                </span>
            </fieldset>

            {job && (
                <ResumeOffer job={job} matches={!!matchingQuality} filesLoaded={files.length > 0} busy={busy}
                    onResume={() => run(matchingQuality!)} onDiscard={() => void saved.discard()} />
            )}
            {hasProxies && (
                <button type="button" onClick={() => run('preview')} disabled={disabled} className="btn-quiet w-full justify-center">Preview full match (proxies)</button>
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
