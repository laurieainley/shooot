import type { CropRect } from '../types'
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
    eventIds: string[] // the events in that clip (the event list highlights them while it plays)
    crop?: CropRect    // replays: the part of the picture shown (same as the render)
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
        eventIds: s.goals.map((g) => g.id),
        ...(c.crop ? { crop: c.crop } : {}),
    })))
}

/**
 * Move on once the step's end is reached — but only after the seek to its start has landed (`armed`);
 * otherwise a playhead already past the end would skip the step before it plays.
 */
export function shouldAdvance(timeSec: number, step: PreviewStep, armed: boolean): boolean {
    return armed && timeSec >= step.endSec - 0.05
}

/** The volume (0–1) to play a step at: the viewer's own volume times the step's gain (replays 0.5, as rendered). */
export function previewVolume(userVolume: number, step: Pick<PreviewStep, 'gain'>): number {
    const base = Number.isFinite(userVolume) ? userVolume : 1
    return Math.min(1, Math.max(0, base * step.gain))
}

/**
 * The step to jump to for the previous / next clip ([ ] and the preview arrows): the first step of that clip, so a
 * clip always starts from its normal-speed part. Previous from inside a clip's replay goes back to that clip's start.
 */
export function clipStep(steps: PreviewStep[], current: number, dir: 1 | -1): number {
    const here = steps[current]
    if (!here) return current
    const first = (clip: number): number => steps.findIndex((s) => s.clipIndex === clip)
    if (dir === -1) {
        const start = first(here.clipIndex)
        return start < current ? start : Math.max(0, first(here.clipIndex - 1))
    }
    const next = first(here.clipIndex + 1)
    return next === -1 ? current : next
}
