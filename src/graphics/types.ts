import type { TeamBadge } from './teamStyle'

/** VS / full-time card content. */
export type CardSpec = { heading: string; centre: string; left: TeamBadge; right: TeamBadge }

/** Lower-third content; all text already upper-cased for the display face. */
export type LowerThirdSpec = {
    label: string
    person?: string
    note?: string
    /** Team colour stripe (orange when the event has no team). */
    stripe: string
    /** Scoring events: score after the event, e.g. RR 1–0 WT. */
    score?: { left: string; right: string; text: string }
}

export type OverlaySpec =
    | { kind: 'lowerThird'; cutIndex: number; startSec: number; durationSec: number; spec: LowerThirdSpec; label: string }
    | { kind: 'replayTag'; cutIndex: number; startSec: number; durationSec: number; label: string }

/** What graphics a reel gets, as plain data (see plan.ts); painters.ts turns it into engine graphics. */
export type GraphicsSpec = {
    intro?: CardSpec
    outro?: CardSpec
    overlays: OverlaySpec[]
}
