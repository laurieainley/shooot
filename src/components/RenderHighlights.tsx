import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppState } from '../state'
import { estimatePlanTime, highlightsExport, planOutput, sourceFactsFor, type ExportState, type PlanOutput } from '../utils/exportPlans'
import { startExport } from './renderRequest'
import { useRenderJobs } from '../renderJobs'
import type { RenderQuality } from '../utils/renderSources'
import { applyStorageFit, qualityOptions, resolveHighlightsQuality } from '../utils/outputQuality'
import { MissingFullFiles } from './MissingFullFiles'
import { OutputQualityField } from './OutputQualityField'
import { RenderStatus } from './RenderStatus'
import { ResumeOffer } from './ResumeOffer'
import { useLayout } from './useMediaQuery'
import { useReencodeSupport } from './useReencodeSupport'
import { useSavedJob } from './useSavedJob'
import { useStorageRoom } from './useStorageRoom'
import { renderButtonLabel, renderSummaryLine } from '../utils/renderSummary'

/** Export highlights: quality (Original / 4K / 1080p), the Render button with its size and time, preview with proxies, and the render's progress. */
export function RenderHighlights() {
    // Only what the plan reads (not the playhead), so the panel does not re-plan the reel while the video plays.
    const st = useAppState(useShallow((s): ExportState => ({
        files: s.files, events: s.events, cumulativeOffsets: s.cumulativeOffsets,
        lengthBeforeGoalSec: s.lengthBeforeGoalSec, lengthAfterGoalSec: s.lengthAfterGoalSec, replayBeforeSec: s.replayBeforeSec,
        replayAfterSec: s.replayAfterSec, replaySpeed: s.replaySpeed, graphics: s.graphics, teams: s.teams, matchdayLabel: s.matchdayLabel,
        fullMatch: s.fullMatch, goalAreas: s.goalAreas,
    })))
    const choice = useAppState((s) => s.highlightsQuality)
    const setQuality = useAppState((s) => s.setHighlightsQuality)
    const { files } = st
    const layout = useLayout()
    // Original is the slowest option on a phone, so a phone defaults to 1080p until the user chooses.
    const phone = layout === 'phone' || layout === 'landscape'
    const hasEvents = useAppState((s) => s.events.some((e) => !e.unlinked))
    const busy = useRenderJobs((s) => s.job?.phase === 'running')
    const saved = useSavedJob('highlights', busy)
    const [note, setNote] = useState<string | null>(null)
    const [missing, setMissing] = useState<string[]>([])

    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = files.length === 0 || !hasEvents
    const base = useMemo(() => {
        const p = highlightsExport(st, 'full')
        return { file: p.sources[p.cuts[0]?.sourceIndex ?? 0]?.file, seconds: p.seconds, bytes: p.bytes, plan: p }
    }, [st])
    const known = files[0]?.width && files[0]?.height ? { width: files[0].width, height: files[0].height } : null
    const { source, support } = useReencodeSupport(base.file, known)
    // The time hints follow the plan (ticked cards, captions, replays) and the footage, not a fixed multiple of the reel length.
    const facts = useMemo(() => sourceFactsFor(files, source), [files, source])
    const room = useStorageRoom(busy)
    // A choice that is not available here (4K on 1080p footage, a codec this browser cannot handle) renders as Original;
    // one that will not fit in the browser's storage gives way to the largest that does.
    const { options, effective, note: fitNote, privateHint } = applyStorageFit(
        qualityOptions({ source, support, seconds: base.seconds, originalBytes: base.bytes, time: (q) => estimatePlanTime(base.plan, q, facts) }),
        room, resolveHighlightsQuality(choice, phone))

    const chosen = options.find((o) => o.id === effective) ?? options[0]

    const run = (quality: RenderQuality, output?: PlanOutput): void => {
        const plan = highlightsExport(useAppState.getState(), quality, output)
        if (plan.missing.length > 0) {
            setMissing(plan.missing)
            return
        }
        setMissing([])
        startExport('highlights', quality, plan, false)
    }

    const job = saved.job
    // A saved render resumes as what it was: stream copy, a re-encode at either size, or the preview.
    const candidates: { quality: RenderQuality; output?: PlanOutput }[] = [{ quality: 'full' }, { quality: 'full', output: planOutput('4k') }, { quality: 'full', output: planOutput('1080p') }, { quality: 'preview' }]
    const matching = job ? candidates.find((c) => highlightsExport(useAppState.getState(), c.quality, c.output).signature === job.signature) : undefined

    return (
        <div className="flex flex-col gap-2">
            <OutputQualityField name="highlights-quality" options={options} effective={effective} onChange={setQuality} fitNote={fitNote}>
                {privateHint && <span className="toggle-row__hint">Private windows have very little storage; use a normal window for a long reel.</span>}
            </OutputQualityField>
            <button onClick={() => run('full', planOutput(effective))} disabled={disabled} className="btn-primary w-full justify-center">
                {renderButtonLabel('highlights', effective)}
            </button>
            <p className="export-hint render-estimate m-0">{renderSummaryLine({ bytes: chosen.bytes, timeRange: chosen.timeRange, basis: chosen.timeBasis, seconds: base.seconds })}</p>
            {job && (
                <ResumeOffer job={job} matches={!!matching} filesLoaded={files.length > 0} busy={busy}
                    onResume={() => run(matching!.quality, matching!.output)} onDiscard={() => void saved.discard()} />
            )}
            {hasProxies && (
                <button onClick={() => run('preview')} disabled={disabled} className="btn-quiet w-full justify-center">
                    Preview with proxies
                </button>
            )}
            <MissingFullFiles missing={missing} onChange={(m, msg) => { setMissing(m); setNote(msg) }} onPreviewInstead={() => run('preview')} />
            {note && <p role="note" className="export-hint">{note}</p>}
            <RenderStatus kind="highlights" />
        </div>
    )
}
