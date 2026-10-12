import type { HighlightSegment } from './highlights'
import type { Cut } from '../render/types'
import type { CropRect, MatchEvent } from '../types'
import { eventLabel } from './eventTypes'
import { formatHMS } from './timeline'
import { wantsReplay } from './replays'

export type ReplayOptions = {
    beforeSec: number; afterSec: number; speed: number
    /** The part of the frame a replay of this event shows (null = whole frame). */
    cropFor?: (e: MatchEvent) => CropRect | null
}

/** Replays keep their (slowed, pitch-kept) audio at half volume (−6 dB). */
export const REPLAY_GAIN = 0.5

/** Where a cut of the plan comes from: the clip of segment `segment`, or a replay inside that segment. */
export type CutOrigin = { segment: number; replay: boolean }

export function buildRenderPlan(segments: HighlightSegment[], durationsSec: number[], replay?: ReplayOptions): Cut[] {
    return buildRenderPlanWithOrigins(segments, durationsSec, replay).cuts
}

/** The plan plus, for every cut (same order), which segment it belongs to and whether it is a replay. */
export function buildRenderPlanWithOrigins(segments: HighlightSegment[], durationsSec: number[], replay?: ReplayOptions): { cuts: Cut[]; origins: CutOrigin[] } {
    const cuts: Cut[] = []
    const origins: CutOrigin[] = []
    let segment = 0
    const push = (sourceIndex: number, start: number, end: number, extra: Partial<Cut> = {}): void => {
        const dur = durationsSec[sourceIndex] ?? Infinity
        const startSec = Math.max(0, Math.min(start, dur))
        const endSec = Math.max(0, Math.min(end, dur))
        if (endSec > startSec) { cuts.push({ sourceIndex, startSec, endSec, ...extra }); origins.push({ segment, replay: extra.speed !== undefined }) }
    }
    for (const [si, s] of segments.entries()) {
        segment = si
        const idx = s.sourceFileIndex
        if (s.startTime < 0 && idx > 0) {
            const prevDur = durationsSec[idx - 1] ?? 0
            push(idx - 1, prevDur + s.startTime, prevDur)
            push(idx, 0, s.endTime)
        } else {
            push(idx, s.startTime, s.endTime)
        }
        if (!replay) continue
        // Replays never span files: the window is clamped to the event's own file.
        const wanted = s.goals.filter(wantsReplay).sort((a, b) => a.matchTimeSec - b.matchTimeSec)
        for (const e of wanted) {
            const crop = replay.cropFor?.(e) ?? null
            push(e.sourceFileIndex ?? idx, e.matchTimeSec - replay.beforeSec, e.matchTimeSec + replay.afterSec,
                { speed: replay.speed, gain: REPLAY_GAIN, ...(crop ? { crop, cropLabel: `Replay zoom: ${eventLabel(e)} ${formatHMS(e.matchTimeSec)}` } : {}) })
        }
    }
    return { cuts, origins }
}
