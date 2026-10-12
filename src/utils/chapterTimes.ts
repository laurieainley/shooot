// Where things are in the rendered video, for the YouTube chapters. The render reports where every cut really
// landed (RenderTimeline); before a render (or when the inputs changed) the same shape is estimated from the plan.
import type { Cut, CutTiming, RenderTimeline } from '../render/types'
import type { HighlightSegment } from './highlights'
import type { CutOrigin } from './renderPlan'

/** Stream-copied cuts keep whole GOPs: with ~1 s GOPs (GoPro) a cut gains about half a second at each end on average. */
export const ESTIMATED_GOP_SLACK_SEC = 1

/** The timing of one finished cut: it starts at `cursor` in the output, copies source `cutStart`…`cutEnd`, at `speed`. */
export function cutTiming(cursor: number, cutStart: number, cutEnd: number, speed = 1): CutTiming {
    return { outStartSec: cursor, sourceStartSec: cutStart, outDurationSec: (cutEnd - cutStart) / speed }
}

/** The timeline the plan implies, after a title card of `introSec` (each cut padded by the expected key-frame slack). */
export function estimateTimeline(cuts: Cut[], introSec: number, slackSec = ESTIMATED_GOP_SLACK_SEC): RenderTimeline {
    let cursor = introSec
    return cuts.map((c) => {
        const t = cutTiming(cursor, Math.max(0, c.startSec - slackSec / 2), c.endSec + slackSec / 2, c.speed ?? 1)
        cursor += t.outDurationSec
        return t
    })
}

/** Output second where cut `index` begins; for a cut that is not in the output, where the next present one (or the end) is. */
function startOf(timeline: RenderTimeline, index: number): number {
    for (let i = index; i < timeline.length; i++) if (timeline[i]) return timeline[i]!.outStartSec
    const last = [...timeline].reverse().find((t) => t)
    return last ? last.outStartSec + last.outDurationSec : 0
}

/**
 * The output second each event's chapter points at. A segment's first event is at the start of its clip (the first
 * normal-speed cut: the lead-in starts there). Later events of a merged clip are at their own lead-in
 * (`time − before`) inside the clip, measured from where the clip's cut really starts, never before the clip's start.
 */
export function highlightEventTimes(p: {
    segments: HighlightSegment[]; cuts: Cut[]; origins: CutOrigin[]; timeline: RenderTimeline; beforeSec: number
}): Map<string, number> {
    const times = new Map<string, number>()
    p.segments.forEach((seg, si) => {
        const clip = p.origins.map((o, i) => (o.segment === si && !o.replay ? i : -1)).filter((i) => i >= 0)
        const anyCut = p.origins.findIndex((o) => o.segment === si)
        const clipStart = startOf(p.timeline, clip[0] ?? (anyCut >= 0 ? anyCut : p.timeline.length))
        seg.goals.forEach((e, k) => {
            let at = clipStart
            if (k > 0) {
                const file = e.sourceFileIndex ?? 0
                const own = clip.find((i) => p.cuts[i].sourceIndex === file && p.cuts[i].startSec <= e.matchTimeSec && e.matchTimeSec <= p.cuts[i].endSec && p.timeline[i])
                if (own !== undefined) {
                    const t = p.timeline[own]!
                    at = t.outStartSec + Math.min(t.outDurationSec, Math.max(0, e.matchTimeSec - p.beforeSec - t.sourceStartSec))
                }
            }
            times.set(e.id, at)
        })
    })
    return times
}

/**
 * Output second of timeline position `absSec` (whole-recording seconds) in a continuous copy of `cuts`, given where
 * each cut really landed. Before the first cut it is the first cut's start; in a gap, the previous cut's end.
 */
export function outputTimeAt(absSec: number, cuts: Cut[], timeline: RenderTimeline, offsets: number[]): number {
    let result = 0
    for (let i = 0; i < cuts.length; i++) {
        const t = timeline[i]
        if (!t) continue
        const abs0 = (offsets[cuts[i].sourceIndex] ?? 0) + t.sourceStartSec
        if (absSec < abs0) return Math.max(result, t.outStartSec)
        const speed = cuts[i].speed ?? 1
        if (absSec <= abs0 + t.outDurationSec * speed) return t.outStartSec + (absSec - abs0) / speed
        result = t.outStartSec + t.outDurationSec
    }
    return result
}
