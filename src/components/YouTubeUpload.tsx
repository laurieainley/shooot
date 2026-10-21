/** YouTube's play-button icon, unmodified: a red rounded rectangle with a white triangle. Inline, no request. */
function YouTubeIcon() {
    return (
        <svg viewBox="0 0 28 20" width="22" height="16" aria-hidden="true" focusable="false" className="youtube-icon">
            <rect width="28" height="20" rx="5" fill="#FF0000" />
            <path d="M11 5.5v9l8-4.5z" fill="#FFFFFF" />
        </svg>
    )
}

/** Opens YouTube's own upload page in a new tab: nothing is sent to YouTube until the user uploads there. */
export function YouTubeUpload() {
    return (
        <a href="https://www.youtube.com/upload" target="_blank" rel="noopener noreferrer" className="btn-quiet no-underline inline-flex items-center gap-2">
            <YouTubeIcon />
            Upload to YouTube <span aria-hidden="true">↗</span>
        </a>
    )
}
