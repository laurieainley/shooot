import { useState } from 'react'
import { formatReport, type DiagnosticsReport } from '../render/diagnostics'

interface CopyDiagnosticsProps {
    /** A render report, formatted on click. */
    report?: DiagnosticsReport
    /** Or any text, built on click (playback diagnostics, crash note). */
    getText?: () => string
    label?: string
    ariaLabel?: string
}

/** Copies the readable diagnostics; when the clipboard is refused, shows the text to select by hand. */
export function CopyDiagnostics({ report, getText, label = 'Copy diagnostics', ariaLabel = 'Diagnostics report' }: CopyDiagnosticsProps) {
    const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
    const [text, setText] = useState('')
    const copy = (): void => {
        const t = getText ? getText() : report ? formatReport(report) : ''
        setText(t)
        const write = navigator.clipboard?.writeText(t)
        if (!write) { setState('manual'); return }
        write.then(() => setState('copied'), () => setState('manual'))
    }
    return (
        <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-quiet" onClick={copy}>{label}</button>
                {state === 'copied' && <span role="status" className="export-hint">Copied</span>}
            </span>
            {state === 'manual' && (
                <textarea aria-label={ariaLabel} readOnly value={text} rows={6} className="w-full font-mono text-ui-xs" onFocus={(e) => e.currentTarget.select()} />
            )}
        </span>
    )
}
