import type { TeamBadge } from './teamStyle'

/** VS / full-time card content. */
export type CardSpec = { heading: string; centre: string; left: TeamBadge; right: TeamBadge }

/** Score bug: team initials and colours either side of the score, e.g. WH 1–0 CO. */
export type BugSpec = { left: string; right: string; leftColour: string; rightColour: string; text: string }

/** Event caption content; all text already upper-cased for the display face. */
export type CaptionSpec = {
    label: string
    person?: string
    note?: string
    /** Team colour stripe (orange when the event has no team). */
    stripe: string
    /** Score after the event (scoring events) or at it (others); none without two teams. */
    bug?: BugSpec
}

/** A score that holds from `fromSec` (source seconds of the cut) on. */
export type BugScore = { fromSec: number; bug: BugSpec }

type OverlayTiming = { cutIndex: number; startSec: number; durationSec: number; label: string }

export type OverlaySpec =
    /**
     * `clock`: a caption split over two cuts (its clip, then the start of the replay) runs one 5 s timeline:
     * caption time = offsetSec + t × rate (rate 1 / speed on a slowed replay), out of totalSec.
     */
    | OverlayTiming & { kind: 'caption'; spec: CaptionSpec; clock: CaptionClock; fromCutStart?: boolean }
    | OverlayTiming & { kind: 'replayTag' }
    /** Score bug; `scores` in time order; hidden during `hide` windows (a caption shows the score then). */
    | OverlayTiming & { kind: 'scoreBug'; scores: BugScore[]; fadeIn: boolean; fadeOut: boolean }

export type CaptionClock = { offsetSec: number; rate: number; totalSec: number }

/** What graphics a reel gets, as plain data (see plan.ts); painters.ts turns it into engine graphics. */
export type GraphicsSpec = {
    intro?: CardSpec
    outro?: CardSpec
    overlays: OverlaySpec[]
}
