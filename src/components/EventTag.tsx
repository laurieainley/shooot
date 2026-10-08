import type { MatchEvent } from '../types'
import { controlLabel } from '../utils/eventTypes'
import { EventIcon } from './icons/EventIcon'

interface EventTagProps {
    event: Pick<MatchEvent, 'type'> & { pen?: boolean }
    /** Replaces the default text, e.g. a picker option's label. */
    children?: string
}

/** The event type as icon + label in plain chalk text (picker list, edit-sheet chips); only a goal's icon carries colour. */
export function EventTag({ event, children }: EventTagProps) {
    return (
        <span className="ev-label">
            <EventIcon event={event} size={20} decorative />
            <span className="ev-label__text">{children ?? controlLabel(event)}</span>
        </span>
    )
}
