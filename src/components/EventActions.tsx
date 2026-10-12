import type { ReactNode } from 'react'
import type { MatchEvent } from '../types'
import { isMarker } from '../utils/eventTypes'
import { wantsReplay } from '../utils/replays'

export interface EventActionsProps {
    event: MatchEvent
    touch: boolean
    onToggleReplay: () => void
    onFraming: () => void
    onEdit: () => void
    onRemove: () => void
    /** The clip download control (Part B); not rendered when absent. */
    download?: ReactNode
}

/** The selected row's second line: slow-mo replay switch, edit, framing (replay on), download, delete. */
export function EventActions({ event: e, touch, onToggleReplay, onFraming, onEdit, onRemove, download }: EventActionsProps) {
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const marker = isMarker(e)
    const replay = !marker && wantsReplay(e)
    const btn = `act-btn${touch ? ' act-btn--touch' : ''}`
    return (
        <div className="event-actions" role="group" aria-label="Event actions" onClick={stop}>
            {!marker && (
                <button type="button" role="switch" aria-checked={replay} aria-label="Slow-mo replay" title="Slow-mo replay (R)"
                    className={`${btn} act-switch`} onClick={onToggleReplay}>
                    <span className="act-switch__track" aria-hidden="true"><span className="act-switch__knob" /></span>
                    <span className="event-actions__label">Slow-mo replay</span>
                    <span className="act-switch__glyph" aria-hidden="true">↻</span>
                </button>
            )}
            <button type="button" className={btn} aria-label="Edit details" title="Edit details (E person · T team · N note)" onClick={onEdit}>
                <PersonIcon /><span className="event-actions__label">Edit</span>
            </button>
            {replay && (
                <button type="button" className={btn} aria-label="Replay framing" title="Replay framing (zoom to the goal)" onClick={onFraming}>
                    <span aria-hidden="true">⌖</span><span className="event-actions__label">Framing</span>
                </button>
            )}
            {!marker && download ? <span className="event-actions__download">{download}</span> : null}
            <button type="button" className={`${btn} act-btn--delete`} aria-label="Delete event" title="Delete (⌫)" onClick={onRemove}>
                <span aria-hidden="true">×</span><span className="event-actions__label">Delete</span>
            </button>
        </div>
    )
}

function PersonIcon() {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.8 14c.4-2.8 2.6-4.3 5.2-4.3s4.8 1.5 5.2 4.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}
