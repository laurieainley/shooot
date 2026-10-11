// Time remapping helpers for footage: speed ramps are integrals of a rate curve.
import { FPS } from './brand'

/** Source seconds elapsed after `f` frames at a per-frame playback rate. */
export function integrate(f: number, rate: (i: number) => number): number {
    let t = 0
    const whole = Math.floor(f)
    for (let i = 0; i < whole; i++) t += rate(i) / FPS
    return t + (f - whole) * rate(whole) / FPS
}

/** First frame at which the integrated time reaches `target` (for freezing on a moment). */
export function frameAt(target: number, rate: (i: number) => number, max = 2000): number {
    let t = 0
    for (let i = 0; i < max; i++) {
        const next = t + rate(i) / FPS
        if (next >= target) return i + (target - t) / (rate(i) / FPS)
        t = next
    }
    return max
}
