/** The picture is split into thirds: double-tapping a side seeks, a single tap anywhere toggles playback. */
export type TapZone = 'left' | 'centre' | 'right'
export type Tap = { time: number; zone: TapZone }

export const DOUBLE_TAP_MS = 300

/** A second tap on the same side (not the centre) within the window is a double tap. */
export function isDoubleTap(last: Tap | null, tap: Tap, windowMs = DOUBLE_TAP_MS): boolean {
    return last !== null && tap.zone !== 'centre' && last.zone === tap.zone && tap.time - last.time < windowMs
}
