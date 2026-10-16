import { useMemo, useState } from 'react'
import { useAppState } from '../state'
import { useShallow } from 'zustand/react/shallow'
import { estimatePlanTime, fullMatchExport, planOutput, sourceFactsFor, type ExportState, type PlanOutput } from '../utils/exportPlans'
import { formatBytes, PHONE_SIZE_WARNING } from '../utils/fullMatch'
import { finalWhistleSec } from '../utils/matchClock'
import { linkedEvents } from '../utils/relink'
import type { RenderQuality } from '../utils/renderSources'
import { applyStorageFit, qualityOptions, QUALITY_LABEL, saveToFileQuality } from '../utils/outputQuality'
import { hasSavePicker } from '../utils/savePicker'
import { fullMatchSummary, renderButtonLabel, renderSummaryLine, SAVE_TO_FILE_HINT } from '../utils/renderSummary'
import { MAX_INTERVAL_MIN, MIN_INTERVAL_MIN, type ScoreBugMode } from '../utils/scoreBug'
import { ExportDisclosure } from './ExportDisclosure'
import { OutputQualityField } from './OutputQualityField'
import { MissingFullFiles } from './MissingFullFiles'
import { RenderStatus } from './RenderStatus'
import { ResumeOffer } from './ResumeOffer'
import { saveExportToFile, startExport } from './renderRequest'
import { useRenderJobs } from '../renderJobs'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'
import { useSavedJob } from './useSavedJob'
import { useReencodeSupport } from './useReencodeSupport'
import { useReusableParts } from './useReusableParts'
import { useStorageRoom } from './useStorageRoom'
import { formatReelLength } from '../utils/reel'

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

    const firstSource = useMemo(() => {
        const base = fullMatchExport(st, 'full')
        return { file: base.sources[base.cuts[0]?.sourceIndex ?? 0]?.file, seconds: base.seconds, bytes: base.bytes, plan: base }
    }, [st])
    const known = files[0]?.width && files[0]?.height ? { width: files[0].width, height: files[0].height } : null
    const { source, support } = useReencodeSupport(firstSource.file, known)
    const facts = useMemo(() => sourceFactsFor(files, source), [files, source])
    const room = useStorageRoom(busy)
    // Parts of the last export that are still saved are not encoded again: the time hints count them out.
    const reusable = useReusableParts('fullMatch', firstSource.plan, busy)
    // A choice that is not available here (e.g. 4K chosen in a saved project, now on 1080p footage) renders as Original;
    // one that will not fit in the browser's storage gives way to the largest that does.
    const { options, effective, note: fitNote, privateHint } = applyStorageFit(
        qualityOptions({ source, support, seconds: firstSource.seconds, originalBytes: firstSource.bytes, time: (q) => estimatePlanTime(firstSource.plan, q, facts, reusable(q)) }), room, fullMatch.quality)
    const plan = useMemo(() => fullMatchExport(st, 'full', planOutput(effective)), [st, effective])
    const linked = linkedEvents(events)
    const hasKickOff = linked.some((e) => e.type === 'kick_off')
    const hasWhistle = finalWhistleSec(linked, cumulativeOffsets) !== null
    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = plan.cuts.length === 0
    const chosen = options.find((o) => o.id === effective) ?? options[0]

    // Save to file… writes straight to disk, so it keeps the chosen quality even when that is too big for the browser's storage.
    const canSave = hasSavePicker()
    const saveQuality = canSave ? saveToFileQuality(options, fullMatch.quality, effective) : effective
    const saveToFile = (): void => {
        const p = fullMatchExport(useAppState.getState(), 'full', planOutput(saveQuality))
        if (p.missing.length > 0) { setMissing(p.missing); return }
        setMissing([])
        void saveExportToFile('fullMatch', p, true) // the picker opens first, inside the click
    }

    const run = (quality: RenderQuality, output?: PlanOutput): void => {
        const p = fullMatchExport(useAppState.getState(), quality, quality === 'full' ? output : undefined)
        if (p.missing.length > 0) { setMissing(p.missing); return }
        setMissing([])
        startExport('fullMatch', quality, p, true)
    }
    const job = saved.job
    // A saved render resumes as what it was: stream copy, a re-encode at either size, or the preview.
    const candidates: { quality: RenderQuality; output?: PlanOutput }[] = [{ quality: 'full' }, { quality: 'full', output: planOutput('4k') }, { quality: 'full', output: planOutput('1080p') }, { quality: 'preview' }]
    const matching = job ? candidates.find((c) => fullMatchExport(useAppState.getState(), c.quality, c.output).signature === job.signature) : undefined

    if (files.length === 0) return <p className="export-body text-muted m-0 py-3">Load the match videos first.</p>

    return (
        <div className="flex flex-col gap-2">
            <div role="group" aria-label="Full match summary" className="reel-summary">
                <p className="reel-summary__length m-0">
                    <b className="tc">{formatReelLength(plan.seconds)}</b>
                    <span> · Kick off to Final whistle</span>
                </p>
                {(!hasKickOff || !hasWhistle) && <p className="reel-summary__settings m-0">{phone ? 'Tag Kick off and Final whistle to trim the warm-up and the end.' : 'Tag Kick off (K) and Final whistle (W) to trim the warm-up and the end.'}</p>}
            </div>
            {phone && plan.bytes > PHONE_SIZE_WARNING && (
                <p role="alert" className="export-note">This file will be over 2 GB ({formatBytes(plan.bytes)}): make sure the phone has room, or render the preview from the proxies.</p>
            )}

            <OutputQualityField name="full-match-quality" options={options} effective={effective} saveToFile={canSave ? { selected: saveQuality } : undefined} onChange={(q) => setFullMatch({ quality: q })} fitNote={fitNote}>
                {privateHint && <span className="toggle-row__hint">Private windows have very little storage; use a normal window for a full match.</span>}
            </OutputQualityField>
            <button type="button" onClick={() => run('full', planOutput(effective))} disabled={disabled} className="btn-primary w-full justify-center">
                {renderButtonLabel('full match', effective)}
            </button>
            <p className="export-hint render-estimate m-0">{renderSummaryLine({ bytes: chosen.bytes, timeRange: chosen.timeRange, basis: chosen.timeBasis, seconds: firstSource.seconds })}</p>
            {canSave && (
                <>
                    <button type="button" onClick={saveToFile} disabled={disabled || busy} className="btn-quiet w-full justify-center">Save to file… ({QUALITY_LABEL[saveQuality]})</button>
                    <p className="export-hint m-0">{SAVE_TO_FILE_HINT}</p>
                </>
            )}
            {job && (
                <ResumeOffer job={job} matches={!!matching} filesLoaded={files.length > 0} busy={busy}
                    onResume={() => run(matching!.quality, matching!.output)} onDiscard={() => void saved.discard()} />
            )}
            {hasProxies && (
                <button type="button" onClick={() => run('preview')} disabled={disabled} className="btn-quiet w-full justify-center">Preview with proxies</button>
            )}
            <MissingFullFiles missing={missing} onChange={(m, msg) => { setMissing(m); setNote(msg) }} onPreviewInstead={() => run('preview')} />
            {note && <p role="note" className="export-hint">{note}</p>}
            <RenderStatus kind="fullMatch" />

            <ExportDisclosure id="fullMatchIncluded" title="Included" summary={fullMatchSummary(fullMatch)}>
                <label className="toggle-row">
                    <input type="checkbox" checked={fullMatch.cards} onChange={(e) => setFullMatch({ cards: e.target.checked })} />
                    <span className="toggle-row__text">Title &amp; full-time cards<span className="toggle-row__hint">VS card before Kick off, final score after the Final whistle</span></span>
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
                            : 'After each goal, at Kick off and Half time, and every few minutes.'}
                    </span>
                </fieldset>
            </ExportDisclosure>
        </div>
    )
}
