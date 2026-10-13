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
    before: number
    after: number
    replay: ReplayOptions
}): ReelSummary {
    const { events, cumulativeOffsets, durationsSec, before, after, replay } = args
    const segments = mergeOverlappingGoalSegments(linkedEvents(events), cumulativeOffsets, before, after)
    const cuts = buildRenderPlan(segments, durationsSec, replay)
    const seconds = cuts.reduce((sum, c) => sum + (c.endSec - c.startSec) / (c.speed ?? 1), 0)
    return { seconds, clips: segments.length }
}

/** A reel or match length: m:ss under an hour, h:mm:ss from an hour (the Export panel's one length format). */
export function formatReelLength(seconds: number): string {
    const s = Math.max(0, Math.round(seconds))
    const ss = `${s % 60}`.padStart(2, '0')
    return s < 3600 ? `${Math.floor(s / 60)}:${ss}` : `${Math.floor(s / 3600)}:${`${Math.floor((s % 3600) / 60)}`.padStart(2, '0')}:${ss}`
}

/** `Clips: 10 s before / 4 s after · Replays: 3 s → 1 s at 0.5×` — the Export panel's one-line recap of the clip settings. */
export function clipSettingsLine(s: { before: number; after: number; replayBeforeSec: number; replayAfterSec: number; replaySpeed: number }): string {
    return `Clips: ${s.before} s before / ${s.after} s after · Replays: ${s.replayBeforeSec} s → ${s.replayAfterSec} s at ${s.replaySpeed}×`
}
