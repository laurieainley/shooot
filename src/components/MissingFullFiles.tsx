import { useRef, type ChangeEvent } from 'react'
import { useAppState } from '../state'
import { FILE_INPUT_ACCEPT } from '../utils/fileAccept'
import { resolveRenderSources } from '../utils/renderSources'

interface MissingFullFilesProps {
    missing: string[]
    onChange: (missing: string[], message: string | null) => void
    onPreviewInstead: () => void
}

/** Proxy timelines: the full-quality files a render needs, with a picker that attaches them. */
export function MissingFullFiles({ missing, onChange, onPreviewInstead }: MissingFullFilesProps) {
    const pickRef = useRef<HTMLInputElement | null>(null)
    const onPick = (evt: ChangeEvent<HTMLInputElement>): void => {
        const picked = Array.from(evt.target.files ?? [])
        evt.target.value = ''
        const unmatched = useAppState.getState().attachFullFiles(picked)
        const still = resolveRenderSources(useAppState.getState().files, 'full').missing
        onChange(still, unmatched.length > 0 ? `No match for: ${unmatched.join(', ')}` : still.length === 0 ? 'Full-quality files attached' : null)
    }
    if (missing.length === 0) return null
    return (
        <div className="rounded border border-danger/50 p-2 text-[13px] text-muted">
            <p className="mb-1">Full-quality files needed for:</p>
            <ul className="mb-2 list-disc pl-4">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <div className="flex gap-2">
                <button onClick={() => pickRef.current?.click()} className="btn-primary">Pick full files</button>
                <button onClick={onPreviewInstead} className="btn-quiet">Render preview instead</button>
            </div>
            <input ref={pickRef} type="file" multiple accept={FILE_INPUT_ACCEPT} onChange={onPick} className="hidden" />
        </div>
    )
}
