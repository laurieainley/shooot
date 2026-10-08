import { useState } from 'react'
import { useAppState } from '../state'
import { highlightsExport } from '../utils/exportPlans'
import { startExport } from './renderRequest'
import { useRenderJobs } from '../renderJobs'
import type { RenderQuality } from '../utils/renderSources'
import { MissingFullFiles } from './MissingFullFiles'
import { RenderStatus } from './RenderStatus'
import { ResumeOffer } from './ResumeOffer'
import { useSavedJob } from './useSavedJob'

export function RenderHighlights() {
    const files = useAppState((s) => s.files)
    const hasEvents = useAppState((s) => s.events.some((e) => !e.unlinked))
    const busy = useRenderJobs((s) => s.job?.phase === 'running')
    const saved = useSavedJob('highlights', busy)
    const [note, setNote] = useState<string | null>(null)
    const [missing, setMissing] = useState<string[]>([])

    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = files.length === 0 || !hasEvents

    const run = (quality: RenderQuality): void => {
        const plan = highlightsExport(useAppState.getState(), quality)
        if (plan.missing.length > 0) {
            setMissing(plan.missing)
            return
        }
        setMissing([])
        startExport('highlights', quality, plan, false)
    }

    const job = saved.job
    const matchingQuality = job ? (['full', 'preview'] as const).find((q) => highlightsExport(useAppState.getState(), q).signature === job.signature) : undefined

    return (
        <div className="flex flex-col gap-2">
            {job && (
                <ResumeOffer job={job} matches={!!matchingQuality} filesLoaded={files.length > 0} busy={busy}
                    onResume={() => run(matchingQuality!)} onDiscard={() => void saved.discard()} />
            )}
            {hasProxies && (
                <button onClick={() => run('preview')} disabled={disabled} className="btn-quiet w-full justify-center">
                    Preview reel (proxies)
                </button>
            )}
            <button onClick={() => run('full')} disabled={disabled} className="btn-primary w-full justify-center">
                {hasProxies ? 'Full quality render' : 'Render MP4'}
            </button>
            <MissingFullFiles missing={missing} onChange={(m, msg) => { setMissing(m); setNote(msg) }} onPreviewInstead={() => run('preview')} />
            {note && <p role="note" className="m-0 text-[12px] text-muted">{note}</p>}
            <RenderStatus kind="highlights" />
        </div>
    )
}
