import { useState } from 'react'
import { formatReport, type DiagnosticsReport } from '../render/diagnostics'

interface CopyDiagnosticsProps {
    report: DiagnosticsReport
}

/** Copies the readable render diagnostics; when the clipboard is refused, shows the text to select by hand. */
export function CopyDiagnostics({ report }: CopyDiagnosticsProps) {
    const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
    const text = formatReport(report)
    const copy = (): void => {
        const write = navigator.clipboard?.writeText(text)
        if (!write) { setState('manual'); return }
        write.then(() => setState('copied'), () => setState('manual'))
    }
    return (
        <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-quiet" onClick={copy}>Copy diagnostics</button>
                {state === 'copied' && <span role="status" className="text-[12px] text-muted">Copied</span>}
            </span>
            {state === 'manual' && (
                <textarea aria-label="Diagnostics report" readOnly value={text} rows={6} className="w-full font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
            )}
        </span>
    )
}
