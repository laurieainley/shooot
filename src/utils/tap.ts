/** The picture is split into thirds: double-tapping a side seeks, a single tap anywhere toggles playback. */
export type TapZone = 'left' | 'centre' | 'right'
export type Tap = { time: number; zone: TapZone }

export const DOUBLE_TAP_MS = 300

/** A second tap on the same side (not the centre) within the window is a double tap. */
export function isDoubleTap(last: Tap | null, tap: Tap, windowMs = DOUBLE_TAP_MS): boolean {
    return last !== null && tap.zone !== 'centre' && last.zone === tap.zone && tap.time - last.time < windowMs
}

/** After a recognised double tap, taps this soon are the rest of an excited triple tap and are ignored. */
export const TRIPLE_TAP_MS = 500

export type TapMemory = { last: Tap | null; ignoreUntil: number }
export const NO_TAPS: TapMemory = { last: null, ignoreUntil: 0 }

/**
 * toggle: play/pause now (centre) · toggle-later: play/pause unless a second tap arrives within DOUBLE_TAP_MS ·
 * seek: double tap on a side · ignore: a further tap within TRIPLE_TAP_MS of a double tap (or of a tap ignored that way).
 */
export type TapAction = 'toggle' | 'toggle-later' | 'seek' | 'ignore'

/** Pure tap state machine: feed every tap in, get what to do and the memory for the next one. */
export function resolveTap(memory: TapMemory, tap: Tap): { memory: TapMemory; action: TapAction } {
    if (tap.time < memory.ignoreUntil) return { memory: { last: null, ignoreUntil: tap.time + TRIPLE_TAP_MS }, action: 'ignore' }
    if (isDoubleTap(memory.last, tap)) return { memory: { last: null, ignoreUntil: tap.time + TRIPLE_TAP_MS }, action: 'seek' }
    return { memory: { last: tap, ignoreUntil: 0 }, action: tap.zone === 'centre' ? 'toggle' : 'toggle-later' }
}
