/**
 * Turning a phone sideways fills the screen on its own (touch view). Pure rules; `Player` carries them out.
 * - landscape rises while not fullscreen: enter (and remember it was automatic);
 * - landscape ends: leave again, but only a fill the app made (fullscreen the user chose in portrait stays);
 * - the user leaves the fill while still landscape: stay out until the next rotation.
 */
export interface FillMemory {
    landscape: boolean
    /** The current fill was made by rotating. */
    auto: boolean
    /** The user left an automatic fill: don't re-enter until the next rotation. */
    suppressed: boolean
}

export const NO_FILL: FillMemory = { landscape: false, auto: false, suppressed: false }

export interface FillInput {
    /** A touch phone held sideways with a video loaded. */
    landscape: boolean
    /** Real or CSS fullscreen. */
    fullscreen: boolean
}

export type FillAction = 'enter' | 'exit' | null

export function nextFill(mem: FillMemory, { landscape, fullscreen }: FillInput): { mem: FillMemory; action: FillAction } {
    if (landscape && !mem.landscape) {
        return { mem: { landscape: true, auto: !fullscreen, suppressed: false }, action: fullscreen ? null : 'enter' }
    }
    if (landscape) {
        if (mem.auto && !fullscreen) return { mem: { landscape: true, auto: false, suppressed: true }, action: null }
        return { mem, action: null }
    }
    if (mem.landscape) return { mem: NO_FILL, action: mem.auto && fullscreen ? 'exit' : null }
    return { mem, action: null }
}
