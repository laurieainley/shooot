import type { Suggestion } from '../types'
import { effectiveStatus } from './suggestions'

/** A found moment is "being watched" from this long before its estimate to this long after (a jump lands 6 s before). */
export const MOMENT_BEFORE_SEC = 8
export const MOMENT_AFTER_SEC = 3

/** The pending moment the playhead is on (whole-timeline seconds), the nearest when windows overlap. */
export function momentAt(moments: Suggestion[], nowSec: number): Suggestion | null {
    let best: Suggestion | null = null
    for (const m of moments) {
        if (nowSec < m.globalTimeSec - MOMENT_BEFORE_SEC || nowSec > m.globalTimeSec + MOMENT_AFTER_SEC) continue
        if (!best || Math.abs(nowSec - m.globalTimeSec) < Math.abs(nowSec - best.globalTimeSec)) best = m
    }
    return best
}

/** After deciding a moment: the first pending one later than it (the list is in match order). */
export const momentAfter = (moments: Suggestion[], afterSec: number): Suggestion | null => moments.find((m) => m.globalTimeSec > afterSec) ?? null

/** "3 of 7": place among every found moment in match order, decided ones included (so it never shifts as you go). */
export function momentPosition(all: Suggestion[], id: string): { index: number; total: number } | null {
    const sorted = [...all].sort((a, b) => a.globalTimeSec - b.globalTimeSec)
    const i = sorted.findIndex((s) => s.id === id)
    return i < 0 ? null : { index: i + 1, total: sorted.length }
}

export function momentChipText(moment: Suggestion, pos: { index: number; total: number }, clock: string): string {
    return `${moment.ball ? '★ Top pick' : 'Found moment'} · ${pos.index} of ${pos.total} · ${clock}`
}

export interface FindGoalsChipInput {
    /** Percent while Find goals runs, else null. */
    running: number | null
    /** False when the videos changed since the run. */
    current: boolean
    suggestions: Suggestion[]
    eventIds: ReadonlySet<string>
}

export interface FindGoalsChipState {
    state: 'idle' | 'running' | 'found' | 'checked'
    label: string
}

/** The touch view's Find goals chip: not run / running / what is left to check / all checked. */
export function findGoalsChip({ running, current, suggestions, eventIds }: FindGoalsChipInput): FindGoalsChipState {
    if (running !== null) return { state: 'running', label: `Finding goals · ${running}%` }
    if (!current || suggestions.length === 0) return { state: 'idle', label: 'Find goals' }
    const pending = suggestions.filter((s) => effectiveStatus(s, eventIds) === 'pending')
    if (pending.length === 0) return { state: 'checked', label: 'All found moments checked' }
    const top = pending.filter((s) => s.ball).length
    return { state: 'found', label: `${pending.length} found${top > 0 ? ` · ${top} top ${top === 1 ? 'pick' : 'picks'}` : ''}` }
}
