import type { GraphicsReport } from '../render'
import type { RenderResult } from './useRenderRunner'

interface RenderStatusProps {
    busy: boolean
    status: string
    report: GraphicsReport | null
    result: RenderResult | null
    onCancel: () => void
}

/** Progress (with Keep-the-screen-open and Cancel while rendering), skipped graphics, and the finished file. */
export function RenderStatus({ busy, status, report, result, onCancel }: RenderStatusProps) {
    const canShare = result != null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [result.file] })
    const skipped = report ? [...new Map(report.skipped.map((g) => [`${g.label}|${g.reason}`, g])).values()] : []
    return (
        <>
            {busy && (
                <div className="render-busy">
                    <p className="m-0">Keep this screen open until the render finishes.</p>
                    <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
                </div>
            )}
            {status && <div role="status" className="tc text-[12px] text-muted">{status}</div>}
            {skipped.length > 0 && (
                <div className="rounded border border-line p-2 text-[12px] text-muted">
                    <p className="m-0 mb-1">Rendered without:</p>
                    <ul className="m-0 list-disc pl-4">
                        {skipped.map((g, i) => <li key={i}>{g.label} — {g.reason}</li>)}
                    </ul>
                </div>
            )}
            {result && (
                <div className="flex items-center gap-3">
                    <a href={result.url} download={result.file.name} className="btn-primary no-underline">
                        Download {result.file.name}
                    </a>
                    {canShare && (
                        <button onClick={() => navigator.share({ files: [result.file] }).catch(() => undefined)} className="btn-quiet">
                            Share
                        </button>
                    )}
                </div>
            )}
        </>
    )
}
