import type { MatchEvent } from '../types'
import { isScoring } from './eventTypes'

/** The brand's voice for empty, loading and success states (BRAND.md). Errors and instructions stay plain; wit lives here only. */
export const REEL_READY = "Reel ready. Group chat won't know what's hit it."
export const GOAL_MARKED = 'Goal marked.'

export type EmptyLog = { lead: string; hint: string; key?: string; tail?: string }

/** The empty event log: the line, then what to do (touch: tap ＋; keyboard: press G). */
export function emptyLogLine(coarse: boolean, noFiles: boolean): EmptyLog {
    const lead = 'No goals yet. Classic.'
    if (coarse) return { lead, hint: noFiles ? 'Load a video, then tap ＋ while it plays.' : 'Tap ＋ while the video plays.' }
    return { lead, hint: noFiles ? 'Load a video, then press' : 'Press', key: 'G', tail: 'while it plays.' }
}

const pct = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction)) * 100)

/** The progress line in the Export panel (the exact percentage sits in the status line under it). */
export const POLISHING = 'Polishing the tap-ins…'

/** The same, short enough for the top-bar chip, with the percentage. */
export function polishingChip(fraction: number): string {
    return `Polishing… ${pct(fraction)}%`
}

/** The id of the one scoring event added between two event lists, else null (removals, imports and undo never celebrate). */
export function goalMarkedFor(before: Pick<MatchEvent, 'id' | 'type'>[], after: Pick<MatchEvent, 'id' | 'type'>[]): string | null {
    if (after.length !== before.length + 1) return null
    const known = new Set(before.map((e) => e.id))
    const added = after.filter((e) => !known.has(e.id))
    return added.length === 1 && isScoring(added[0]) ? added[0].id : null
}
