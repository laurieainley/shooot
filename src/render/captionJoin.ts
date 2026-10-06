// A caption that starts in a clip and carries on over its replay is one logical window: it must not fade or gap at the
// join. Clips end on whole GOPs, a little after the planned end, so the clip part stays up to the real end and the
// replay part carries on from there on the caption's own clock.

/** How long (seconds) the clip part of a carried-on caption is shown: to the clip's real end, within the caption's total. */
export function clipPartSeconds(startSec: number, plannedSec: number, realEnd: number, totalSec: number): number {
    return Math.min(totalSec, Math.max(plannedSec, realEnd - startSec))
}

/**
 * The replay part after a clip part that showed `shownSec` of the caption: it was planned to start at caption time
 * `plannedOffsetSec`; `rate` is caption seconds per source second of the replay. Null when nothing is left to show.
 */
export function replayPartAfter(o: { shownSec: number; plannedOffsetSec: number; totalSec: number; rate: number; replaySec: number }): { paintShiftSec: number; durationSec: number } | null {
    const durationSec = Math.min(o.replaySec, (o.totalSec - o.shownSec) / o.rate)
    if (durationSec < 0.05) return null
    return { paintShiftSec: (o.shownSec - o.plannedOffsetSec) / o.rate, durationSec }
}
