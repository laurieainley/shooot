import type { HighlightSegment } from './highlights'
import { buildRenderPlan, type ReplayOptions } from './renderPlan'

/** One stretch of in-player preview: a clip (or part of a cross-file clip) or a slowed replay. */
export type PreviewStep = {
    sourceIndex: number
    startSec: number
    endSec: number
    speed: number      // playbackRate
    gain: number       // volume factor (replays play quieter, as rendered)
    replay: boolean
    clipIndex: number  // which clip of the reel this step belongs to
}

/** The preview follows the render plan exactly, so what you preview is what gets rendered. */
export function buildPreviewPlan(segments: HighlightSegment[], durationsSec: number[], replay?: ReplayOptions): PreviewStep[] {
    return segments.flatMap((s, clipIndex) => buildRenderPlan([s], durationsSec, replay).map((c) => ({
        sourceIndex: c.sourceIndex,
        startSec: c.startSec,
        endSec: c.endSec,
        speed: c.speed ?? 1,
        gain: c.gain ?? 1,
        replay: c.speed !== undefined,
        clipIndex,
    })))
}

/**
 * Move on once the step's end is reached — but only after the seek to its start has landed (`armed`);
 * otherwise a playhead already past the end would skip the step before it plays.
 */
export function shouldAdvance(timeSec: number, step: PreviewStep, armed: boolean): boolean {
    return armed && timeSec >= step.endSec - 0.05
}
