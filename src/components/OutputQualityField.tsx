import { useId, useState, type ReactNode } from 'react'
import { formatBytes } from '../utils/fullMatch'
import { QUALITY_LABEL, type OutputQuality, type QualityOption } from '../utils/outputQuality'
import { QUALITY_EXPLANATION, qualityShortReason } from '../utils/renderSummary'

interface OutputQualityFieldProps {
    /** Radio group name (unique per tab). */
    name: string
    options: QualityOption[]
    /** The option in use (after availability and storage fit). */
    effective: OutputQuality
    /** "Save to file…" is offered: options greyed out only for lack of storage can still be picked (it needs none), and `selected` is the one shown. */
    saveToFile?: { selected: OutputQuality }
    onChange: (q: OutputQuality) => void
    /** Said when the choice was changed for lack of storage. */
    fitNote?: string | null
    /** Extra hint lines (private window…). */
    children?: ReactNode
}

/** Quality: Original / 4K / 1080p as a segmented control with each option's size under its label (or a short reason when unavailable). Shared by both Export tabs. */
export function OutputQualityField({ name, options, effective, saveToFile, onChange, fitNote, children }: OutputQualityFieldProps) {
    const [explaining, setExplaining] = useState(false)
    const explainId = useId()
    return (
        <fieldset className="segmented-field quality-field">
            <legend>Quality</legend>
            <div className="segmented segmented--quality" role="radiogroup" aria-label="Quality">
                {options.map((o) => {
                    const reason = qualityShortReason(o)
                    return (
                        <label key={o.id} className="segmented__option" title={o.disabled ? (o.reason ?? undefined) : undefined}>
                            <input type="radio" name={name} value={o.id} checked={(saveToFile?.selected ?? effective) === o.id} disabled={o.disabled && !(saveToFile && o.noRoom)} onChange={() => onChange(o.id)} />
                            <span className="segmented__stack">
                                <b className="segmented__label">{o.label}</b>
                                <em className="segmented__sub tc">{reason ?? formatBytes(o.bytes)}</em>
                            </span>
                        </label>
                    )
                })}
            </div>
            <button type="button" className="link-btn quality-field__help" aria-expanded={explaining} aria-controls={explainId} onClick={() => setExplaining((v) => !v)}>
                What’s the difference?
            </button>
            {explaining && (
                <ul id={explainId} className="quality-field__explain">
                    {options.map((o) => <li key={o.id}><b>{QUALITY_LABEL[o.id]}</b> — {QUALITY_EXPLANATION[o.id]}</li>)}
                </ul>
            )}
            {fitNote && <span role="note" className="export-hint">{fitNote}</span>}
            {saveToFile && saveToFile.selected !== effective && <span role="note" className="export-hint">{QUALITY_LABEL[saveToFile.selected]} is too big for the Render button; only Save to file… can write it.</span>}
            {children}
        </fieldset>
    )
}
