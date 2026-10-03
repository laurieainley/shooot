import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useAppState } from '../state'
import { renderReel } from '../render'
import { mergeOverlappingGoalSegments } from '../utils/highlights'
import { linkedEvents } from '../utils/relink'
import { buildRenderPlan } from '../utils/renderPlan'
import { resolveRenderSources, formatRenderProgress, type RenderQuality } from '../utils/renderSources'
import { FILE_INPUT_ACCEPT } from '../utils/fileAccept'

type Result = { url: string; file: File }

export function RenderHighlights() {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const attachFullFiles = useAppState((s) => s.attachFullFiles)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)
    const [missing, setMissing] = useState<string[]>([])
    const [result, setResult] = useState<Result | null>(null)
    const pickRef = useRef<HTMLInputElement | null>(null)

    const linked = useMemo(() => linkedEvents(events), [events])
    const hasProxies = files.some((f) => f.kind === 'proxy')
    const disabled = busy || files.length === 0 || linked.length === 0

    const run = async (quality: RenderQuality): Promise<void> => {
        const { sources, missing: miss } = resolveRenderSources(files, quality)
        if (miss.length > 0) {
            setMissing(miss)
            return
        }
        setMissing([])
        if (result) URL.revokeObjectURL(result.url)
        setResult(null)
        setBusy(true)
        setStatus('Preparing…')
        try {
            const segments = mergeOverlappingGoalSegments(linked, cumulativeOffsets, matchStartTimeSec, adjustTimestampsByOffset, before, after)
            const cuts = buildRenderPlan(segments, files.map((f) => f.durationSec ?? Infinity),
                { beforeSec: replayBeforeSec, afterSec: replayAfterSec, speed: replaySpeed })
            const out = await renderReel(cuts, sources, { onProgress: (p) => setStatus(formatRenderProgress(p)) })
            const name = quality === 'preview' ? 'highlights-preview.mp4' : 'highlights.mp4'
            const file = new File([out], name, { type: 'video/mp4' })
            setResult({ url: URL.createObjectURL(file), file })
            setStatus('Done')
        } catch (e) {
            setStatus(`Render failed: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setBusy(false)
        }
    }

    const onPickFull = (evt: ChangeEvent<HTMLInputElement>): void => {
        const picked = Array.from(evt.target.files ?? [])
        evt.target.value = ''
        const unmatched = attachFullFiles(picked)
        const stillMissing = resolveRenderSources(useAppState.getState().files, 'full').missing
        setMissing(stillMissing)
        if (unmatched.length > 0) setStatus(`No match for: ${unmatched.join(', ')}`)
        else if (stillMissing.length === 0) setStatus('Full-quality files attached')
    }

    const canShare = result != null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [result.file] })

    return (
        <div className="flex flex-col gap-2">
            {hasProxies && (
                <button
                    onClick={() => run('preview')}
                    disabled={disabled}
                    className="w-full rounded-md border border-yellow/50 bg-transparent px-3 py-2 text-sm font-bold text-yellow cursor-pointer hover:bg-yellow/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Preview reel (LRV)
                </button>
            )}
            <button
                onClick={() => run('full')}
                disabled={disabled}
                className="w-full rounded-md bg-yellow px-3 py-2.5 text-sm font-bold text-deep border-none cursor-pointer hover:bg-yellow/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                {hasProxies ? 'Full quality render' : 'Render MP4'}
            </button>

            {missing.length > 0 && (
                <div className="rounded border border-pink/40 p-2 text-xs text-muted">
                    <p className="mb-1">Full-quality files needed for:</p>
                    <ul className="mb-2 list-disc pl-4">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                    <div className="flex gap-2">
                        <button onClick={() => pickRef.current?.click()} className="rounded bg-yellow px-2 py-1 font-bold text-deep border-none cursor-pointer">
                            Pick full files
                        </button>
                        <button onClick={() => run('preview')} className="rounded border border-border bg-transparent px-2 py-1 text-light cursor-pointer">
                            Render preview instead
                        </button>
                    </div>
                    <input ref={pickRef} type="file" multiple accept={FILE_INPUT_ACCEPT} onChange={onPickFull} className="hidden" />
                </div>
            )}

            {status && <div className="text-xs text-muted">{status}</div>}
            {result && (
                <div className="flex gap-3">
                    <a href={result.url} download={result.file.name} className="text-sm font-semibold text-yellow hover:text-yellow/80">
                        Download {result.file.name}
                    </a>
                    {canShare && (
                        <button
                            onClick={() => navigator.share({ files: [result.file] }).catch(() => undefined)}
                            className="bg-transparent border-none p-0 text-sm font-semibold text-yellow cursor-pointer"
                        >
                            Share
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
