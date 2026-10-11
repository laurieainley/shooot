import type { Suggestion } from '../types'
import { effectiveStatus } from './suggestions'

/** Review lanes: All suggestions, or Top picks (the ball was seen in a goal mouth). Both keep match order. */
export type Lane = 'all' | 'top'

const inLane = (s: Suggestion, lane: Lane): boolean => lane === 'all' || !!s.ball

export function laneCounts(suggestions: readonly Suggestion[]): { all: number; top: number } {
    return { all: suggestions.length, top: suggestions.filter((s) => !!s.ball).length }
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
