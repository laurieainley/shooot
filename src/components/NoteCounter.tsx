import { NOTE_MAX } from '../utils/eventTypes'

/** How many characters before the limit the count shows. */
const SHOW_FROM = NOTE_MAX - 20

/** A quiet "84 / 100" under a note box once it is within 20 characters of the limit. The live region is always there so the count is announced when it appears. */
export function NoteCounter({ value }: { value: string }) {
    return (
        <span aria-live="polite" className="note-counter text-ui-xs text-muted">
            {value.length >= SHOW_FROM ? `${value.length} / ${NOTE_MAX}` : ''}
        </span>
    )
}
