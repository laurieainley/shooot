import type { EventType, MatchEvent } from '../types'
import { eventTone, tagText, TONE_CLASS } from '../utils/eventStyle'

interface EventIconProps {
    type: EventType
}

/** Small line icons for the quiet event tags (Save, Foul, Highlight, penalties, flags). Goals are marked by their lime fill alone. */
export function EventIcon({ type }: EventIconProps) {
    const common = { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true, focusable: false, className: 'ev-icon' } as const
    const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
    switch (type) {
        case 'save': return <svg {...common}><path d="M8 1.8 13.2 3.6v4c0 3.1-2.1 5.4-5.2 6.6-3.1-1.2-5.2-3.5-5.2-6.6v-4z" {...stroke} /></svg>
        case 'foul': return <svg {...common}><rect x="4" y="2" width="8" height="12" rx="1.4" fill="currentColor" /></svg>
        case 'highlight': return <svg {...common}><path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor" /></svg>
        case 'penalty_conceded': return <svg {...common}><circle cx="8" cy="8" r="6" {...stroke} /><path d="M6.4 11.4V4.8h2.2a1.8 1.8 0 0 1 0 3.6H6.4" {...stroke} /></svg>
        case 'penalty_missed': return <svg {...common}><circle cx="8" cy="8" r="6" {...stroke} /><path d="m4 12 8-8" {...stroke} /></svg>
        case 'kick_off': return <svg {...common}><path d="M4 14V2m0 1h8l-2.4 3L12 9H4" {...stroke} /></svg>
        case 'half_time': return <svg {...common}><path d="M5.5 3v10M10.5 3v10" {...stroke} /></svg>
        case 'final_whistle': return <svg {...common}><path d="M3 3h10v10H3zM3 8h10M8 3v10" {...stroke} /></svg>
        default: return null
    }
}

interface EventTagProps {
    event: Pick<MatchEvent, 'type'> & { pen?: boolean }
    /** Own goal as "OG" (tight rows). */
    short?: boolean
    /** Replaces the default text, e.g. a picker option's label. */
    children?: string
}

/** The event type as a skewed tag: Goal lime fill, Penalty goal lime outline, Own goal chalk fill, the rest quiet with an icon. */
export function EventTag({ event, short = false, children }: EventTagProps) {
    const text = children ?? tagText(event, short)
    const full = tagText(event, false)
    return (
        <span className={`ev-tag ${TONE_CLASS[eventTone(event)]}`} title={short && text !== full ? full : undefined}>
            <span className="ev-tag__text">
                <EventIcon type={event.type} />
                {text}
            </span>
            {short && text !== full && <span className="sr-only">{full}</span>}
        </span>
    )
}
