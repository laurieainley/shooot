// The "COMING UP" teaser: starred events' own clips, planned ahead of the reel.
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

export type HighlightsCuts = {
    /** Teaser cuts first, then the reel. */
    cuts: Cut[]
    /** One per cut; teaser cuts are `{ segment: -1, replay: false }`, reel origins index into `segments`. */
    origins: CutOrigin[]
    /** The reel's segments (not the teaser's). */
    segments: HighlightSegment[]
    teaserSegments: HighlightSegment[]
    teaserCount: number
    /** One per teaser cut: the index into `teaserSegments` of the clip it belongs to (a clip crossing a file join has two cuts). */
    teaserClips: number[]
}

/**
 * The highlights cuts: each starred event's own padded window (no slow-mo replay; merged only with other starred events),
 * then the reel exactly as without a teaser. `teaser: false` or nothing starred = just the reel.
 */
export function highlightsCuts(a: {
    events: MatchEvent[]; cumulativeOffsets: number[]; durationsSec: number[]; before: number; after: number; replay?: ReplayOptions; teaser: boolean
}): HighlightsCuts {
    const segments = mergeOverlappingGoalSegments(a.events, a.cumulativeOffsets, a.before, a.after)
    const reel = buildRenderPlanWithOrigins(segments, a.durationsSec, a.replay)
    const teaserSegments = a.teaser ? mergeOverlappingGoalSegments(teaserEvents(a.events), a.cumulativeOffsets, a.before, a.after) : []
    if (teaserSegments.length === 0) return { cuts: reel.cuts, origins: reel.origins, segments, teaserSegments: [], teaserCount: 0, teaserClips: [] }
    const teaser = buildRenderPlanWithOrigins(teaserSegments, a.durationsSec)
    return {
        cuts: [...teaser.cuts, ...reel.cuts],
        origins: [...teaser.origins.map((): CutOrigin => ({ segment: -1, replay: false })), ...reel.origins],
        segments, teaserSegments, teaserCount: teaser.cuts.length, teaserClips: teaser.origins.map((o) => o.segment),
    }
}

/** The Export row's recap: how many starred moments, and the length of the teaser's own cuts (no replays, none of the reel). */
export function teaserLength(a: {
    events: MatchEvent[]; cumulativeOffsets: number[]; durationsSec: number[]; before: number; after: number
}): { moments: number; seconds: number } {
    const { cuts, teaserCount } = highlightsCuts({ ...a, teaser: true })
    return {
        moments: teaserEvents(a.events).length,
        seconds: cuts.slice(0, teaserCount).reduce((sum, c) => sum + (c.endSec - c.startSec) / (c.speed ?? 1), 0),
    }
}
