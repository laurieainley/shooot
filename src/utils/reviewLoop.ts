export type LoopWindow = { startAbs: number; endAbs: number }
/** `seekingSince`: wall-clock ms when the loop itself asked the player to seek (null once the player has landed). */
export type LoopState = { released: boolean; seekingSince: number | null }

const SLACK_BEFORE_SEC = 1
const SLACK_AFTER_SEC = 2
const SEEK_GRACE_MS = 3000

/**
 * Review loop bookkeeping. Time updates arrive after the loop's own seeks (the player answers a beat later), so
 * positions outside the window are ignored while one is pending. A position outside the window otherwise means the
 * user seeked away: the loop is released and stops pulling the playhead back.
 */
export function stepLoop(state: LoopState, nowAbs: number, w: LoopWindow, wallMs: number): { state: LoopState; loop: boolean } {
    if (state.released) return { state, loop: false }
    const outside = nowAbs < w.startAbs - SLACK_BEFORE_SEC || nowAbs > w.endAbs + SLACK_AFTER_SEC
    if (state.seekingSince !== null) {
        if (!outside && nowAbs < w.endAbs) return { state: { released: false, seekingSince: null }, loop: false }
        if (wallMs - state.seekingSince > SEEK_GRACE_MS) return { state: { released: true, seekingSince: null }, loop: false }
        return { state, loop: false }
    }
    if (outside) return { state: { released: true, seekingSince: null }, loop: false }
    if (nowAbs >= w.endAbs) return { state: { released: false, seekingSince: wallMs }, loop: true }
    return { state, loop: false }
}

export const REVIEW_STEP_SEC = 2

/** Review window around `timeSec`: default offsets plus how far the user has extended each side; clamped to [0, totalSec]. */
export function reviewWindow(
    timeSec: number, defaults: readonly [number, number], extraBefore: number, extraAfter: number, totalSec: number,
): LoopWindow {
    const startAbs = Math.max(0, timeSec + defaults[0] - extraBefore)
    const endAbs = Math.min(Math.max(timeSec, totalSec), timeSec + defaults[1] + extraAfter)
    return { startAbs, endAbs }
}

/** Compact label for the window relative to the suggestion, e.g. "−7 s … +4 s". */
export function formatReviewWindow(timeSec: number, w: LoopWindow): string {
    const f = (v: number): string => {
        const r = Math.round(v)
        return `${r < 0 ? '−' : '+'}${Math.abs(r)} s`
    }
    return `${f(w.startAbs - timeSec)} … ${f(w.endAbs - timeSec)}`
}
