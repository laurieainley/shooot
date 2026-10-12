// YouTube descriptions for the two exports: final score, chapters, goalscorers — blocks separated by blank lines.
import type { MatchEvent, Team } from '../types'
import type { RenderTimeline } from '../render/types'
import { highlightChapterLines, matchChapterLines } from './chapters'
import { estimateTimeline, highlightEventTimes, outputTimeAt } from './chapterTimes'
import { fullMatchCuts, fullMatchSpan, withReplays } from './fullMatch'
import { mergeOverlappingGoalSegments } from './highlights'
import { buildRenderPlanWithOrigins } from './renderPlan'
import { goalscorers } from './goalscorers'
import { finalWhistleSec, kickOffSec } from './matchClock'
import { linkedEvents } from './relink'
import type { ReplayOptions } from './renderPlan'

type DescriptionArgs = {
    events: MatchEvent[]
    teams: Team[]
    cumulativeOffsets: number[]
    before: number
    after: number
    replay?: ReplayOptions
    /** The full match includes slow-mo replays (needs `replay`). */
    fullMatchReplays?: boolean
    /** Length of the title card at the start of the video (0 without cards). */
    introSec: number
    /** File lengths (unknown = missing); they decide where cuts are clamped or split, so chapters can follow the plan. */
    durationsSec?: (number | undefined)[]
    /**
     * Where each cut of this export's plan really landed in the rendered video (from the render). Only pass it for the
     * same plan; without it (or when its length does not fit) the times are estimated from the plan.
     */
    timeline?: RenderTimeline | null
}

function compose(blocks: string[][]): string {
    return blocks.filter((b) => b.length > 0).map((b) => b.join('\n')).join('\n\n')
}

/** The scorers under a Goalscorers heading (nothing when nobody scored). */
function scorersBlock(lines: string[]): string[] {
    return lines.length > 0 ? ['Goalscorers', ...lines] : []
}

export function highlightsDescription(a: DescriptionArgs): string {
    const linked = linkedEvents(a.events)
    const { scoreLine, lines } = goalscorers(linked, a.teams)
    const segments = mergeOverlappingGoalSegments(linked, a.cumulativeOffsets, a.before, a.after)
    const { cuts, origins } = buildRenderPlanWithOrigins(segments, (a.durationsSec ?? []).map((d) => d ?? Infinity), a.replay)
    const timeline = a.timeline && a.timeline.length === cuts.length ? a.timeline : estimateTimeline(cuts, a.introSec)
    const times = highlightEventTimes({ segments, cuts, origins, timeline, beforeSec: a.before })
    const chapters = highlightChapterLines(linked, a.cumulativeOffsets, a.before, a.after, a.teams, a.replay, a.introSec, times)
    return compose([scoreLine ? [scoreLine] : [], chapters, scorersBlock(lines)])
}

export function fullMatchDescription(a: DescriptionArgs): string {
    const linked = linkedEvents(a.events)
    const { scoreLine, lines } = goalscorers(linked, a.teams)
    const start = kickOffSec(linked, a.cumulativeOffsets)
    const end = finalWhistleSec(linked, a.cumulativeOffsets)
    // The video is one stream copy from kick-off, which starts at the key frame before it: follow the real (or planned) cuts.
    const matchCuts = fullMatchCuts((a.durationsSec ?? []).map((d) => d ?? 0), ...spanOf(linked, a))
    // Inserted replays are extra cuts; events map to their normal-speed cut (outputTimeAt).
    const cuts = a.fullMatchReplays && a.replay ? withReplays(matchCuts, linked, a.cumulativeOffsets, a.replay) : matchCuts
    const timeline = a.timeline && a.timeline.length === cuts.length ? a.timeline : estimateTimeline(cuts, a.introSec)
    const timeAt = cuts.length > 0 ? (abs: number): number => outputTimeAt(abs, cuts, timeline, a.cumulativeOffsets) : undefined
    const chapters = matchChapterLines(linked, a.cumulativeOffsets, start, end, a.before, a.teams, a.introSec, timeAt)
    return compose([scoreLine ? [scoreLine] : [], chapters, scorersBlock(lines)])
}

/** Start and end of the full match video on the whole-recording timeline (as the export computes them). */
function spanOf(events: MatchEvent[], a: DescriptionArgs): [number, number] {
    const span = fullMatchSpan(events, a.cumulativeOffsets, (a.durationsSec ?? []).map((d) => d ?? 0))
    return [span.startSec, span.endSec]
}
