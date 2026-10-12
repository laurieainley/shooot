// Live "about N min left" for a running render, from its real progress: an exponential moving average of the
// fraction-per-second rate (the same as media-seconds per wall-second, scaled by the length), so it adapts to the device.

export type EtaState = {
    firstAt: number
    lastAt: number
    lastFraction: number
    /** Smoothed progress per second (fraction of the render), null until a sample exists. */
    rate: number | null
}

/** Weight of the newest sample. */
export const EMA_ALPHA = 0.2
/** Wait for this much wall time before showing an estimate (the first seconds are start-up, not speed). */
export const MIN_ELAPSED_MS = 5000
const MIN_SAMPLE_MS = 500

/** Folds one reading (`now` in ms, `fraction` 0..1) into the state. */
export function stepEta(prev: EtaState | null, now: number, fraction: number): EtaState {
    if (!prev) return { firstAt: now, lastAt: now, lastFraction: fraction, rate: null }
    const dt = (now - prev.lastAt) / 1000
    if (dt * 1000 < MIN_SAMPLE_MS) return prev
    const gain = fraction - prev.lastFraction
    // No progress yet (a card or a long first unit): keep the old rate rather than dragging it to zero.
    if (gain <= 0) return { ...prev, lastAt: now, lastFraction: Math.max(prev.lastFraction, fraction) }
    const sample = gain / dt
    return { ...prev, lastAt: now, lastFraction: fraction, rate: prev.rate === null ? sample : prev.rate + EMA_ALPHA * (sample - prev.rate) }
}

/** Seconds left, or null while there is too little progress to say. */
export function etaSeconds(s: EtaState | null): number | null {
    if (!s || s.rate === null || s.rate <= 0) return null
    if (s.lastAt - s.firstAt < MIN_ELAPSED_MS) return null
    return Math.max(0, (1 - s.lastFraction) / s.rate)
}

/** "about 12 min left" / "under a minute left" / "about 1 h 5 min left". */
export function formatEta(seconds: number | null): string | null {
    if (seconds === null) return null
    if (seconds < 60) return 'under a minute left'
    const min = Math.round(seconds / 60)
    if (min < 60) return `about ${min} min left`
    const h = Math.floor(min / 60)
    const m = min % 60
    return `about ${h} h${m ? ` ${m} min` : ''} left`
}
