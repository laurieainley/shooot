import type { MatchEvent } from '../types'
import { controlLabel, shortNote } from './eventTypes'

export interface EventRowParts {
    /** Scorer / person, shown beside the icon in the shirt font. */
    person: string | undefined
    /** Short note, shown inline after the name (muted, truncated). */
    note: string | undefined
    /** Everything on one line, for the tooltip. */
    title: string
}

/** The text pieces of an event-log row: person and note (assists are not shown in the rail). */
export function eventRowParts(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'notes'>): EventRowParts {
    const person = e.scorer?.trim() || undefined
    const note = shortNote(e.notes) || undefined
    const title = [controlLabel(e), person, note].filter(Boolean).join(' · ')
    return { person, note, title }
}
