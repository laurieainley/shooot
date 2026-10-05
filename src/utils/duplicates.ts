import type { MatchEvent } from '../types'

export const DUPLICATE_WINDOW_SEC = 3

/**
 * Another mark close to this one in the same file — usually an accidental double G / double tap.
 * `deltaSec` is negative when the other mark is earlier.
 */
export function nearbyMark(events: MatchEvent[], id: string, windowSec = DUPLICATE_WINDOW_SEC): { event: MatchEvent; deltaSec: number } | null {
    const me = events.find((e) => e.id === id)
    if (!me) return null
    let best: { event: MatchEvent; deltaSec: number } | null = null
    for (const e of events) {
        if (e.id === id || (e.sourceFileIndex ?? 0) !== (me.sourceFileIndex ?? 0)) continue
        const d = e.matchTimeSec - me.matchTimeSec
        if (Math.abs(d) <= windowSec && (!best || Math.abs(d) < Math.abs(best.deltaSec))) best = { event: e, deltaSec: d }
    }
    return best
}
