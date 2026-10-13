import type { Suggestion } from '../types'
import { effectiveStatus } from './suggestions'

/**
 * Review lanes keep match order. With Advanced detection the lanes are disjoint: Top picks (the ball was seen in a goal
 * mouth) and Other moments. Without it there is no switch and the one lane is 'all'.
 */
export type Lane = 'all' | 'top' | 'other'

const inLane = (s: Suggestion, lane: Lane): boolean => lane === 'all' || (lane === 'top' ? !!s.ball : !s.ball)

export function laneCounts(suggestions: readonly Suggestion[]): { all: number; top: number; other: number } {
    const top = suggestions.filter((s) => !!s.ball).length
    return { all: suggestions.length, top, other: suggestions.length - top }
}

/** Like `laneCounts`, but only suggestions still to review: the lane buttons show what is left. */
export function remainingCounts(suggestions: readonly Suggestion[], eventIds: ReadonlySet<string>): { all: number; top: number; other: number } {
    return laneCounts(suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending'))
}

/** 0-based position of a suggestion within the lane; -1 when it is not in it. */
export function positionInLane(suggestions: readonly Suggestion[], lane: Lane, index: number): number {
    const s = suggestions[index]
    if (!s || !inLane(s, lane)) return -1
    let pos = 0
    for (let i = 0; i < index; i++) if (inLane(suggestions[i], lane)) pos++
    return pos
}

/**
 * The next (dir 1) or previous (dir -1) suggestion of the lane after `from`, or null past the end. With `eventIds`
 * only suggestions still to review count (Save moves on to those); without it every member counts (Next / Prev).
 */
export function laneNeighbour(suggestions: readonly Suggestion[], lane: Lane, from: number, dir: 1 | -1, eventIds?: ReadonlySet<string>): number | null {
    for (let i = from + dir; i >= 0 && i < suggestions.length; i += dir) {
        const s = suggestions[i]
        if (inLane(s, lane) && (!eventIds || effectiveStatus(s, eventIds) === 'pending')) return i
    }
    return null
}

/** Where a lane opens: its first suggestion still to review, else its first one; -1 for an empty lane. */
export function firstToReviewInLane(suggestions: readonly Suggestion[], lane: Lane, eventIds: ReadonlySet<string>): number {
    const pending = suggestions.findIndex((s) => inLane(s, lane) && effectiveStatus(s, eventIds) === 'pending')
    return pending >= 0 ? pending : suggestions.findIndex((s) => inLane(s, lane))
}

/** The All / Top picks switch shows once the run used Advanced detection (ball check running, done, or tags exist). */
export function laneSwitchVisible(ballPhase: string, suggestions: readonly Suggestion[]): boolean {
    return ballPhase === 'running' || ballPhase === 'done' || suggestions.some((s) => !!s.ball)
}

/** Appended to the ball check's progress line while top picks arrive. */
export function topPicksLine(n: number): string {
    return n <= 0 ? '' : `${n} top ${n === 1 ? 'pick' : 'picks'} so far`
}

/** The lane review opens on: Top picks while any top pick is still to review, else Other moments. */
export function defaultLane(suggestions: readonly Suggestion[], eventIds: ReadonlySet<string>): Lane {
    return suggestions.some((s) => !!s.ball && effectiveStatus(s, eventIds) === 'pending') ? 'top' : 'other'
}

/** The first suggestion of `lane` still to review, or -1. */
export function firstPendingInLane(suggestions: readonly Suggestion[], lane: Lane, eventIds: ReadonlySet<string>): number {
    return suggestions.findIndex((s) => inLane(s, lane) && effectiveStatus(s, eventIds) === 'pending')
}

/** Copy of the toast shown when the last Top pick is decided and review moves on to the other moments. */
export const TOP_PICKS_DONE = 'Top picks done — on to other moments'

/** Where review opens: the first suggestion still to review in the default lane; the end (summary) when none is. */
export function openingIndex(suggestions: readonly Suggestion[], eventIds: ReadonlySet<string>): number {
    if (!suggestions.some((s) => effectiveStatus(s, eventIds) === 'pending')) return suggestions.length
    const first = firstPendingInLane(suggestions, defaultLane(suggestions, eventIds), eventIds)
    return first >= 0 ? first : suggestions.length
}

/** The quiet rail button after review was closed: "Review suggestions (5 left · 1 top pick)"; null when nothing is left. */
export function reviewRailLabel(suggestions: readonly Suggestion[], eventIds: ReadonlySet<string>): string | null {
    const left = suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending')
    if (left.length === 0) return null
    const top = left.filter((s) => !!s.ball).length
    return `Review suggestions (${left.length} left${top > 0 ? ` · ${top} top ${top === 1 ? 'pick' : 'picks'}` : ''})`
}
