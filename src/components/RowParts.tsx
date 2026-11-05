interface FileSlotProps {
    unlinked?: boolean
    fileKey?: string
}

/** The "file missing" warning when the event's file is not linked; nothing otherwise. */
export function FileSlot({ unlinked, fileKey }: FileSlotProps) {
    if (!unlinked) return null
    // The label hides in narrow rails (icon only), where it would squeeze the event's name out of the row.
    return <span className="tag tag-warn" title={fileKey ? `File missing: ${fileKey}` : 'File missing'}><span className="tag-warn__label">file missing</span></span>
}

interface WatchButtonProps {
    onWatch: () => void
    disabled?: boolean
}

/** Row action: seek to the clip start and play (selecting a row never does). */
export function WatchButton({ onWatch, disabled = false }: WatchButtonProps) {
    return (
        <button type="button" aria-label="Watch" title="Watch the clip (⏎)" tabIndex={-1} disabled={disabled}
            onClick={(ev) => { ev.stopPropagation(); onWatch() }} className="row-btn watch-btn">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
        </button>
    )
}
