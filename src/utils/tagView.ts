import type { Suggestion } from '../types'
import { effectiveStatus } from './suggestions'

/**
 * How the touch player is laid out (spec 2026-10-20-unified-tag-review-design.md):
 * overlay - the picture fills the screen, controls float over it (a phone held sideways, tablets on their side, any fullscreen);
 * band    - the page as before (portrait phone, upright tablet), with the new controls in a band under the picture;
 * off     - a mouse: today's desktop editor, unchanged.
 */
export type TagViewMode = 'overlay' | 'band' | 'off'

export interface TagViewInput {
    coarse: boolean
    /** Layout from `useLayout()`. */
    layout: 'desktop' | 'landscape' | 'phone' | 'tablet'
    /** Real or CSS fullscreen. */
    fullscreen: boolean
    hasFiles: boolean
}

export function tagViewMode({ coarse, layout, fullscreen, hasFiles }: TagViewInput): TagViewMode {
    if (!coarse) return 'off'
    // Before a video is loaded the empty state and the top bar (Choose files) are what the user needs.
    if (!hasFiles && !fullscreen) return 'off'
    if (fullscreen || layout === 'landscape' || layout === 'desktop') return 'overlay'
    return 'band'
}

/** Controls over the picture fade this long after the last touch while playing. */
export const CONTROLS_FADE_MS = 3000

export interface FadeInput {
    mode: TagViewMode
    paused: boolean
    tagging: boolean
}

/**
 * How long the overlay controls stay up after the last touch, or null when they never fade: not over the picture
 * (band / off), while paused, while tagging.
 */
export function fadeDelayMs({ mode, paused, tagging }: FadeInput): number | null {
    if (mode !== 'overlay' || paused || tagging) return null
    return CONTROLS_FADE_MS
}

/** Seconds before a found moment that a jump lands on: no replay loop, ⟲5 replays. */
export const FOUND_LEAD_SEC = 6

/** Pending found moments in match order, as whole-timeline times (what the strip's rings show). */
export function pendingMoments(suggestions: Suggestion[], eventIds: ReadonlySet<string>): Suggestion[] {
    return suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending').sort((a, b) => a.globalTimeSec - b.globalTimeSec)
}

/** Where a jump to a moment lands (whole-timeline seconds). */
export const jumpStartSec = (moment: Suggestion): number => Math.max(0, moment.globalTimeSec - FOUND_LEAD_SEC)

/** The next pending moment whose jump point is ahead of the playhead (a moment already being watched is not "next"). */
export function nextMoment(moments: Suggestion[], nowSec: number): Suggestion | null {
    return moments.find((m) => jumpStartSec(m) > nowSec + 0.5) ?? null
}

/** The previous pending moment: the last whose jump point is behind the playhead (so ◀ restarts a moment being watched). */
export function prevMoment(moments: Suggestion[], nowSec: number): Suggestion | null {
    for (let i = moments.length - 1; i >= 0; i--) if (jumpStartSec(moments[i]) < nowSec - 1) return moments[i]
    return null
}
