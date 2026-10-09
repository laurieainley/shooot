import { useAppState } from '../state'

/** A small "?" at the bottom right of the event rail: opens the Shortcuts sheet (so does the ? key). */
export function ShortcutsButton() {
    return (
        <button type="button" className="shortcuts-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"
            onClick={() => useAppState.getState().openPanel('shortcuts')}>?</button>
    )
}
