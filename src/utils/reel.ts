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

/** `Clips: 10 s before / 4 s after · Replays: 3 s → 1 s at 0.5×` — the Export panel's one-line recap of the clip settings. */
export function clipSettingsLine(s: { before: number; after: number; replayBeforeSec: number; replayAfterSec: number; replaySpeed: number }): string {
    return `Clips: ${s.before} s before / ${s.after} s after · Replays: ${s.replayBeforeSec} s → ${s.replayAfterSec} s at ${s.replaySpeed}×`
}
