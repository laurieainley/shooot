// The "COMING UP" teaser: starred events' own clips (each with its own edits), planned ahead of the reel.
import type { MatchEvent } from '../types'
import type { Cut } from '../render/types'
import { hasMark, isMarker } from './eventTypes'
import { mergeOverlappingGoalSegments, type HighlightSegment } from './highlights'
import { buildRenderPlanWithOrigins, type CutOrigin, type ReplayOptions } from './renderPlan'

/** Linked, non-marker events starred as a teaser, in match order (file, then time). */
export function teaserEvents(events: MatchEvent[]): MatchEvent[] {
    return events
        .filter((e) => !e.unlinked && !isMarker(e) && hasMark(e, 'teaser'))
        .sort((a, b) => (a.sourceFileIndex ?? 0) - (b.sourceFileIndex ?? 0) || a.matchTimeSec - b.matchTimeSec)
}

/** One starred event's teaser clip: its own window (`teaser.beforeSec` / `afterSec`, else the match's clip seconds). */
export function teaserSegment(e: MatchEvent, before: number, after: number): HighlightSegment {
    const b = e.teaser?.beforeSec ?? before
    const a = e.teaser?.afterSec ?? after
    return { startTime: e.matchTimeSec - b, endTime: e.matchTimeSec + a, sourceFileIndex: e.sourceFileIndex ?? 0, goals: [e], duration: a + b }
}

/**
 * The cuts of one teaser clip (a segment of `teaserSegment`): the clip, split at a file join, then its slow-mo replay when the
 * moment has `teaser.replay`, with the match's replay window / speed / gain and the framing `teaser.replayCrop ?? event.replayCrop
 * ?? automatic` (the reel's own crop resolver, given the teaser crop). No `replay` options = no replay.
 */
export function teaserClipPlan(s: HighlightSegment, durationsSec: number[], replay?: ReplayOptions): { cuts: Cut[]; origins: CutOrigin[] } {
    const e = s.goals[0]
    if (!replay || !e?.teaser?.replay) return buildRenderPlanWithOrigins([s], durationsSec)
    // The replay goes by the teaser's switch, not the event's own replay setting, and frames by the teaser crop first.
    const asReplayed: MatchEvent = { ...e, replay: true, replayCrop: e.teaser.replayCrop ?? e.replayCrop }
    return buildRenderPlanWithOrigins([{ ...s, goals: [asReplayed] }], durationsSec, replay)
}

export type HighlightsCuts = {
    /** Teaser cuts first, then the reel. */
    cuts: Cut[]
    /** One per cut; teaser cuts are `{ segment: -1, replay }` (replay: a teaser replay), reel origins index into `segments`. */
    origins: CutOrigin[]
    /** The reel's segments (not the teaser's). */
    segments: HighlightSegment[]
    /** One per starred event (`teaserEvents` order), never merged. */
    teaserSegments: HighlightSegment[]
    /** Teaser cuts, replays included. */
    teaserCount: number
    /** One per teaser cut: the index into `teaserSegments` of the clip it belongs to (a clip crossing a file join has two cuts; its replay cut has the clip's index too). */
    teaserClips: number[]
}

/**
 * The highlights cuts: each starred event's own window as its own clip (its teaser edits: seconds, and a slow-mo replay
 * only when `teaser.replay`), then the reel exactly as without a teaser. `teaser: false` or nothing starred = just the reel.
 */
export function highlightsCuts(a: {
    events: MatchEvent[]; cumulativeOffsets: number[]; durationsSec: number[]; before: number; after: number; replay?: ReplayOptions; teaser: boolean
}): HighlightsCuts {
    const segments = mergeOverlappingGoalSegments(a.events, a.cumulativeOffsets, a.before, a.after)
    const reel = buildRenderPlanWithOrigins(segments, a.durationsSec, a.replay)
    const teaserSegments = a.teaser ? teaserEvents(a.events).map((e) => teaserSegment(e, a.before, a.after)) : []
    if (teaserSegments.length === 0) return { cuts: reel.cuts, origins: reel.origins, segments, teaserSegments: [], teaserCount: 0, teaserClips: [] }
    const cuts: Cut[] = []
    const origins: CutOrigin[] = []
    const teaserClips: number[] = []
    teaserSegments.forEach((s, k) => {
        const plan = teaserClipPlan(s, a.durationsSec, a.replay)
        cuts.push(...plan.cuts)
        origins.push(...plan.origins.map((o): CutOrigin => ({ segment: -1, replay: o.replay })))
        teaserClips.push(...plan.cuts.map(() => k))
    })
    return {
        cuts: [...cuts, ...reel.cuts], origins: [...origins, ...reel.origins],
        segments, teaserSegments, teaserCount: cuts.length, teaserClips,
    }
}

/** The Export row's recap: how many starred moments, and the length of the teaser's own cuts (their replays included, none of the reel). */
export function teaserLength(a: {
    events: MatchEvent[]; cumulativeOffsets: number[]; durationsSec: number[]; before: number; after: number; replay?: ReplayOptions
}): { moments: number; seconds: number } {
    const { cuts, teaserCount } = highlightsCuts({ ...a, teaser: true })
    return {
        moments: teaserEvents(a.events).length,
        seconds: cuts.slice(0, teaserCount).reduce((sum, c) => sum + (c.endSec - c.startSec) / (c.speed ?? 1), 0),
    }
}
