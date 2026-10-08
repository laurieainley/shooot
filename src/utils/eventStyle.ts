import type { MatchEvent } from '../types'
import { controlLabel, isMarker } from './eventTypes'

/** How an event reads at a glance (BRAND.md event tags). Colour is never the only signal: every tone also has its own label or shape. */
export type EventTone = 'goal' | 'pen-goal' | 'own-goal' | 'other' | 'marker'

type Typed = Pick<MatchEvent, 'type'> & { pen?: boolean }

export function eventTone(e: Typed): EventTone {
    if (isMarker(e)) return 'marker'
    if (e.type === 'goal') return e.pen ? 'pen-goal' : 'goal'
    if (e.type === 'own_goal') return 'own-goal'
    return 'other'
}

/** The CSS class that draws each tone (App.css `.ev-tag--*`). */
export const TONE_CLASS: Record<EventTone, string> = {
    goal: 'ev-tag--goal',
    'pen-goal': 'ev-tag--pen-goal',
    'own-goal': 'ev-tag--own-goal',
    other: 'ev-tag--other',
    marker: 'ev-tag--marker',
}

/** Tag text: an own goal is "OG" where space is tight (log rows), the full control label elsewhere. */
export function tagText(e: Typed, short: boolean): string {
    return short && e.type === 'own_goal' ? 'OG' : controlLabel({ type: e.type, pen: e.pen })
}

export type StripTick = 'goal' | 'own-goal' | 'miss' | 'other'

/** The mark on the match strip: lime ticks for goals (penalties included), chalk + "OG" for own goals, an open ring for a missed penalty, grey for the rest. */
export function stripTick(e: Typed): { tick: StripTick; label?: string } {
    if (e.type === 'goal') return { tick: 'goal' }
    if (e.type === 'own_goal') return { tick: 'own-goal', label: 'OG' }
    if (e.type === 'penalty_missed') return { tick: 'miss' }
    return { tick: 'other' }
}
