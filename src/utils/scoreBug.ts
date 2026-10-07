import type { MatchEvent, Team } from '../types'
import { isScoring } from './eventTypes'
import { linkedEvents } from './relink'
import { scoreAt, type Score } from './score'

export type ScoreBugMode = 'off' | 'goals' | 'periodic'
/** One appearance of the full match score bug, on the whole timeline. */
export type ScoreBugWindow = { startSec: number; durationSec: number; score: Score }

export const AFTER_GOAL_SEC = 10
export const KICK_OFF_SEC = 8
export const PERIODIC_SEC = 5
export const MIN_INTERVAL_MIN = 2
export const MAX_INTERVAL_MIN = 15

/**
 * When the full match shows its score bug. After goals: 10 s from each goal. Periodic adds 8 s at kick-off and after
 * any half-time gap, and 5 s every `intervalMin` minutes (2–15). Overlapping windows merge; a goal inside one splits it
 * so each window has one score. Everything is clamped to kick-off … final whistle (the cards sit outside).
 */
export function scoreBugWindows(args: {
    events: MatchEvent[]
    teams: Team[]
    cumulativeOffsets: number[]
    kickOffSec: number
    finalWhistleSec: number
    mode: ScoreBugMode
    intervalMin: number
    /** Starts of later recordings (a camera stop, usually half time), on the whole timeline. */
    gapsSec: number[]
}): ScoreBugWindow[] {
    const { events, teams, cumulativeOffsets: offsets, kickOffSec: k, finalWhistleSec: f, mode } = args
    if (mode === 'off' || teams.length < 2 || !(f > k)) return []
    const goals = linkedEvents(events)
        .filter((e) => isScoring(e) && (e.team === teams[0].name || e.team === teams[1].name))
        .map((e) => (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec)
        .filter((t) => t >= k && t <= f)
        .sort((a, b) => a - b)

    const raw: [number, number][] = goals.map((t) => [t, t + AFTER_GOAL_SEC])
    if (mode === 'periodic') {
        raw.push([k, k + KICK_OFF_SEC])
        for (const g of args.gapsSec) if (g > k && g < f) raw.push([g, g + KICK_OFF_SEC])
        const step = Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, args.intervalMin)) * 60
        for (let t = k + step; t < f; t += step) raw.push([t, t + PERIODIC_SEC])
    }

    const merged: [number, number][] = []
    for (const [a0, b0] of raw.map(([a, b]): [number, number] => [Math.max(k, a), Math.min(f, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
        const last = merged[merged.length - 1]
        if (last && a0 <= last[1]) last[1] = Math.max(last[1], b0)
        else merged.push([a0, b0])
    }

    const out: ScoreBugWindow[] = []
    for (const [a, b] of merged) {
        const cuts = [a, ...goals.filter((t) => t > a && t < b), b]
        for (let i = 0; i + 1 < cuts.length; i++) {
            out.push({ startSec: cuts[i], durationSec: cuts[i + 1] - cuts[i], score: scoreAt(events, teams, offsets, cuts[i]) })
        }
    }
    return out
}

/**
 * Score bug windows with the given intervals (event captions, which carry their own score bug) cut out: a window
 * across one is split into the part before and the part after, same score; parts under 0.05 s are dropped.
 */
export function subtractIntervals(windows: ScoreBugWindow[], intervals: { startSec: number; durationSec: number }[]): ScoreBugWindow[] {
    const cuts = [...intervals].sort((x, y) => x.startSec - y.startSec)
    const out: ScoreBugWindow[] = []
    for (const w of windows) {
        let from = w.startSec
        const end = w.startSec + w.durationSec
        for (const c of cuts) {
            const c0 = c.startSec
            const c1 = c.startSec + c.durationSec
            if (c1 <= from || c0 >= end) continue
            if (c0 - from >= 0.05) out.push({ startSec: from, durationSec: c0 - from, score: w.score })
            from = Math.max(from, c1)
        }
        if (end - from >= 0.05) out.push({ startSec: from, durationSec: end - from, score: w.score })
    }
    return out
}
