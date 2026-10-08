import type { TeamBadge } from './teamStyle'
import type { ThemeId } from './themes/types'

/** One scorer on the full-time card: the name and their minutes, e.g. `'13 '44`. */
export type ScorerLine = { name: string; minutes: string }

/** VS / full-time card content; `scorers` (full time only) are the two columns, one per team. */
export type CardSpec = { heading: string; centre: string; left: TeamBadge; right: TeamBadge; scorers?: { left: ScorerLine[]; right: ScorerLine[] } }

/** Score bug: team initials and colours either side of the score, e.g. WH 1–0 CO. */
export type BugSpec = { left: string; right: string; leftColour: string; rightColour: string; text: string }

/** How the event word's slab is drawn: lime for goals, chalk for own goals, dark for everything else. */
export type CaptionTone = 'goal' | 'ownGoal' | 'other'

/** Event caption content; all text already upper-cased for the display face. */
export type CaptionSpec = {
    /** The event word in the stadium voice: GOAL!, PEN GOAL, OWN GOAL, SAVE ... */
    label: string
    /** Slab colour; goal when omitted. */
    tone?: CaptionTone
    /** Match minute shown after the name as `'34` (only when kick-off is marked). */
    minute?: string
    person?: string
    /** Goals: shown as a smaller `ASSIST: JO` line under the event line. */
    assist?: string
    note?: string
    /** Team colour stripe (the theme's neutral colour when the event has no team). */
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
    | OverlayTiming & { kind: 'caption'; spec: CaptionSpec; clock: CaptionClock; fromCutStart?: boolean; toCutEnd?: boolean }
    /** `speed`: the replay's playback speed, shown as `REPLAY 0.5×`. */
    | OverlayTiming & { kind: 'replayTag'; speed: number }
    /** Score bug; `scores` in time order; hidden during `hide` windows (a caption shows the score then). */
    | OverlayTiming & { kind: 'scoreBug'; scores: BugScore[]; fadeIn: boolean; fadeOut: boolean }

export type CaptionClock = { offsetSec: number; rate: number; totalSec: number }

/** What graphics a reel gets, as plain data (see plan.ts); painters.ts turns it into engine graphics. */
export type GraphicsSpec = {
    /** The look the painters use (shooot when absent). */
    theme?: ThemeId
    intro?: CardSpec
    outro?: CardSpec
    overlays: OverlaySpec[]
}
