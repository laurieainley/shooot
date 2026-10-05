import { useState } from 'react'
import { useAppState } from '../state'
import { highlightsExport } from '../utils/exportPlans'
import { requestFor } from './renderRequest'
import type { RenderQuality } from '../utils/renderSources'
import { MissingFullFiles } from './MissingFullFiles'
import { RenderStatus } from './RenderStatus'
import { ResumeOffer } from './ResumeOffer'
import { useRenderRunner, useSavedJob } from './useRenderRunner'

export function RenderHighlights() {
    const files = useAppState((s) => s.files)
    const hasEvents = useAppState((s) => s.events.some((e) => !e.unlinked))
    const runner = useRenderRunner()
    const saved = useSavedJob('highlights', runner.busy)
    const [missing, setMissing] = useState<string[]>([])

    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = runner.busy || files.length === 0 || !hasEvents

    const run = (quality: RenderQuality): void => {
        const plan = highlightsExport(useAppState.getState(), quality)
        if (plan.missing.length > 0) {
            setMissing(plan.missing)
            return
        }
        setMissing([])
        void runner.run(() => requestFor(plan, (reason) => runner.setReport({ applied: [], skipped: [{ label: 'Graphics', reason }] })), plan.reencodeAll)
    }

    const job = saved.job
    const matchingQuality = job ? (['full', 'preview'] as const).find((q) => highlightsExport(useAppState.getState(), q).signature === job.signature) : undefined

    return (
        <div className="flex flex-col gap-2">
            {job && (
                <ResumeOffer job={job} matches={!!matchingQuality} filesLoaded={files.length > 0} busy={runner.busy}
                    onResume={() => run(matchingQuality!)} onDiscard={() => void saved.discard()} />
            )}
            {hasProxies && (
                <button onClick={() => run('preview')} disabled={disabled} className="btn-quiet w-full justify-center">
                    Preview reel (LRV)
                </button>
            )}
            <button onClick={() => run('full')} disabled={disabled} className="btn-primary w-full justify-center">
                {hasProxies ? 'Full quality render' : 'Render MP4'}
            </button>
            <MissingFullFiles missing={missing} onChange={(m, msg) => { setMissing(m); if (msg) runner.setStatus(msg) }} onPreviewInstead={() => run('preview')} />
            <RenderStatus busy={runner.busy} status={runner.status} report={runner.report} result={runner.result} onCancel={runner.cancel} />
        </div>
    )
}
