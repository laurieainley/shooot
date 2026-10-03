import type { HighlightSegment } from './highlights'
import type { Cut } from '../render/types'

export function buildRenderPlan(segments: HighlightSegment[], durationsSec: number[]): Cut[] {
    const cuts: Cut[] = []
    const push = (sourceIndex: number, start: number, end: number): void => {
        const dur = durationsSec[sourceIndex] ?? Infinity
        const startSec = Math.max(0, Math.min(start, dur))
        const endSec = Math.max(0, Math.min(end, dur))
        if (endSec > startSec) cuts.push({ sourceIndex, startSec, endSec })
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
    }
    return cuts
}
