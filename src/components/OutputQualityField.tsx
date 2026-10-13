import type { ReactNode } from 'react'
import { formatBytes } from '../utils/fullMatch'
import { QUALITY_LABEL, timeHint, type OutputQuality, type QualityOption } from '../utils/outputQuality'

interface OutputQualityFieldProps {
    /** Radio group name (unique per tab). */
    name: string
    options: QualityOption[]
    /** The option in use (after availability and storage fit). */
    effective: OutputQuality
    onChange: (q: OutputQuality) => void
    /** Output length, for the time hints. */
    seconds: number
    /** What `seconds` is the length of in the time hint ("match", "reel"). */
    noun: string
    /** Explains the selected option. */
    description: ReactNode
    /** Said when the choice was changed for lack of storage. */
    fitNote?: string | null
    /** Extra hint lines (private window, keep the screen on…). */
    children?: ReactNode
}

/** Output quality: Original / 4K / 1080p as a segmented control, with each option's size and time (or why it is unavailable). Shared by both Export tabs. */
export function OutputQualityField({ name, options, effective, onChange, seconds, noun, description, fitNote, children }: OutputQualityFieldProps) {
    return (
        <fieldset className="segmented-field">
            <legend>Output quality</legend>
            <div className="segmented" role="radiogroup" aria-label="Output quality">
                {options.map((o) => (
                    <label key={o.id} className="segmented__option">
                        <input type="radio" name={name} value={o.id} checked={effective === o.id} disabled={o.disabled} onChange={() => onChange(o.id)} />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>
            <ul className="m-0 pl-0 list-none flex flex-col gap-1" aria-label="Output quality sizes">
                {options.map((o) => (
                    <li key={o.id} className={`toggle-row__hint${o.disabled ? ' opacity-60' : ''}`}>
                        <b>{QUALITY_LABEL[o.id]}</b>{o.disabled ? (o.noRoom ? ` ${o.reason}` : ` unavailable: ${o.reason}`) : ` about ${formatBytes(o.bytes)}, ${timeHint(o.timeRange, seconds, noun, o.timeBasis)}`}
                    </li>
                ))}
            </ul>
            <span className="toggle-row__hint">{description}</span>
            {fitNote && <span role="note" className="export-hint">{fitNote}</span>}
            {children}
        </fieldset>
    )
}
