import { useAppState } from '../state'

/** Touch: a thumb-sized button that captures the playhead and opens the picker. No event exists until a type is chosen. */
export function Fab() {
    const pickerOpen = useAppState((s) => s.picker !== null || s.panel === 'event')
    const hasFiles = useAppState((s) => s.files.length > 0)
    if (pickerOpen || !hasFiles) return null
    return (
        <button
            type="button"
            aria-label="Mark event"
            className="fab"
            onClick={() => { const st = useAppState.getState(); st.markEvent(st.currentTimeInFileSec, { deferred: true }) }}
        >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        </button>
    )
}
