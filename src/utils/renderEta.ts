// Live "about N min left" for a running render. The engines report progress as the share of estimated WORK done (a copied
// second and a re-encoded one weigh what they cost), so the rate of that fraction is meaningful: an exponential moving average
// of fraction-per-second adapts to the device. Early on there is little to observe, so the estimate is blended with the cost
// model's expected total (`priorSec`, the model's seconds scaled by the rates learned on this device), trusting the
// observation more as progress grows.

export type EtaState = {
    firstAt: number
    firstFraction: number
    lastAt: number
    lastFraction: number
    /** Smoothed progress per second (fraction of the render), null until a sample exists. */
    rate: number | null
    /** The expected wall seconds for the whole render (the cost model), or null when there is none. */
    priorSec: number | null
}

/** Weight of the newest sample. */
export const EMA_ALPHA = 0.2
/** Wait for this much wall time before showing an estimate (the first seconds are start-up, not speed). */
export const MIN_ELAPSED_MS = 5000
const MIN_SAMPLE_MS = 500
/** Progress at which observation and the model count equally: weight of the observation = p / (p + HALF_TRUST). */
export const HALF_TRUST = 0.1

/** Folds one reading (`now` in ms, `fraction` 0..1) into the state. `priorSec`: the model's expected total (kept from the first reading that has one). */
export function stepEta(prev: EtaState | null, now: number, fraction: number, priorSec?: number | null): EtaState {
    const prior = prev?.priorSec ?? (priorSec && priorSec > 0 ? priorSec : null)
    if (!prev) return { firstAt: now, firstFraction: fraction, lastAt: now, lastFraction: fraction, rate: null, priorSec: prior }
    if (prev.priorSec === null && prior !== null) prev = { ...prev, priorSec: prior }
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
    const left = 1 - s.lastFraction
    // Progress arrives in jumps (a re-encoded stretch reports when it ends), so the moving average alone swings: average it with the whole-run rate.
    const overall = (s.lastFraction - s.firstFraction) / ((s.lastAt - s.firstAt) / 1000)
    const rate = overall > 0 ? (s.rate + overall) / 2 : s.rate
    const observed = left / rate
    if (s.priorSec === null) return Math.max(0, observed)
    const w = s.lastFraction / (s.lastFraction + HALF_TRUST)
    return Math.max(0, w * observed + (1 - w) * s.priorSec * left)
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
