import type { MatchEvent } from '../types'
import { assistOf, controlLabel, shortNote } from './eventTypes'

export interface EventRowParts {
    /** Scorer / person, shown beside the tag in the shirt font. */
    person: string | undefined
    /** Second-line parts in order: "Assist: Joe", "— note". */
    sub: string[]
    /** Everything on one line, for the tooltip. */
    title: string
}

/** The text pieces of an event-log row, so the row can lay them out (tag + person, then assist / note beneath). */
export function eventRowParts(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'assist' | 'notes'>): EventRowParts {
    const person = e.scorer?.trim() || undefined
    const assist = assistOf(e)
    const note = shortNote(e.notes)
    const sub = [assist ? `Assist: ${assist}` : '', note ? `— ${note}` : ''].filter(Boolean)
    const title = [controlLabel(e), person, sub.join(' ')].filter(Boolean).join(' · ')
    return { person, sub, title }
}
