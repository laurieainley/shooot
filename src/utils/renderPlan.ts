import type { HighlightSegment } from './highlights'
import type { Cut } from '../render/types'
import { wantsReplay } from './replays'

export type ReplayOptions = { beforeSec: number; afterSec: number; speed: number }

/** Replays keep their (slowed, pitch-kept) audio at half volume (−6 dB). */
export const REPLAY_GAIN = 0.5

export function buildRenderPlan(segments: HighlightSegment[], durationsSec: number[], replay?: ReplayOptions): Cut[] {
    const cuts: Cut[] = []
    const push = (sourceIndex: number, start: number, end: number, extra: Partial<Cut> = {}): void => {
        const dur = durationsSec[sourceIndex] ?? Infinity
        const startSec = Math.max(0, Math.min(start, dur))
        const endSec = Math.max(0, Math.min(end, dur))
        if (endSec > startSec) cuts.push({ sourceIndex, startSec, endSec, ...extra })
    }
    for (const s of segments) {
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
            push(e.sourceFileIndex ?? idx, e.matchTimeSec - replay.beforeSec, e.matchTimeSec + replay.afterSec,
                { speed: replay.speed, gain: REPLAY_GAIN })
        }
    }
    return cuts
}
