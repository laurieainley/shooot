import type { MatchEvent } from '../types'
import { mergeOverlappingGoalSegments } from './highlights'
import { linkedEvents } from './relink'
import { buildRenderPlan, type ReplayOptions } from './renderPlan'

export type ReelSummary = { seconds: number; clips: number }

/** Length of the rendered reel (clips plus slowed replays) and its clip count, from the same plan the renderer uses. */
export function reelSummary(args: {
    events: MatchEvent[]
    cumulativeOffsets: number[]
    durationsSec: number[]
    matchStartSec: number
    adjustTimestampsByOffset: boolean
    before: number
    after: number
    replay: ReplayOptions
}): ReelSummary {
    const { events, cumulativeOffsets, durationsSec, matchStartSec, adjustTimestampsByOffset, before, after, replay } = args
    const segments = mergeOverlappingGoalSegments(linkedEvents(events), cumulativeOffsets, matchStartSec, adjustTimestampsByOffset, before, after)
    const cuts = buildRenderPlan(segments, durationsSec, replay)
    const seconds = cuts.reduce((sum, c) => sum + (c.endSec - c.startSec) / (c.speed ?? 1), 0)
    return { seconds, clips: segments.length }
}

export function formatReelLength(seconds: number): string {
    const s = Math.max(0, Math.round(seconds))
    return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`
}

/** Guessed render seconds per second of reel for a whole-reel re-encode until this device has measured one. */
export const REENCODE_GUESS = { desktop: 0.6, phone: 2.5 }

/** "about 40 s" / "about 3 min": how long re-encoding `reelSec` of video takes on this device. */
export function estimateReencode(reelSec: number, measuredSecPerSec: number | null, phone: boolean): string {
    const rate = measuredSecPerSec ?? (phone ? REENCODE_GUESS.phone : REENCODE_GUESS.desktop)
    const sec = Math.max(1, Math.round(reelSec * rate))
    return sec < 90 ? `about ${sec} s` : `about ${Math.round(sec / 60)} min`
}
