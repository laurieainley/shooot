interface CloseButtonProps {
    onClick: () => void
    label?: string
}

/** The one ✕ for sheets, panels and dialogs: a 20 px icon inside a 44 px hit area (see .close-btn). */
export function CloseButton({ onClick, label = 'Close' }: CloseButtonProps) {
    return (
        <button type="button" aria-label={label} className="close-btn" onClick={onClick}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M4 4l12 12M16 4L4 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
        </button>
    )
}
