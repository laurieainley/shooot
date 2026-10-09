import { useAppState } from '../state'
import { filesSummary } from '../utils/filesSummary'

interface FilesButtonProps {
    /** Phone: an icon and the file count only. */
    compact?: boolean
}

function FilmIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <rect x="3" y="5" width="18" height="14" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}

/** The top bar's one files control: "4 files · 56:34", a dot when something needs attention; opens the Files sheet. */
export function FilesButton({ compact = false }: FilesButtonProps) {
    const files = useAppState((s) => s.files)
    const open = useAppState((s) => s.panel === 'files')
    const { count, label, attention } = filesSummary(files)
    const name = `Files: ${label}${attention.length ? ` — ${attention.join('; ')}` : ''}`
    return (
        <button type="button" className="top-btn top-btn--quiet files-btn" aria-label={name} title={name} aria-haspopup="dialog" aria-expanded={open}
            onClick={() => useAppState.getState().openPanel('files')}>
            <FilmIcon />
            <span className="files-btn__label tc">{compact ? count : label}</span>
            {attention.length > 0 && <span className="files-btn__dot" aria-hidden="true" />}
        </button>
    )
}
