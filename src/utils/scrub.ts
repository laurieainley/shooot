/**
 * Touch scrubbing on the progress bar: dragging only previews the time (bubble, strip playhead);
 * releasing seeks once and restores playback. Seeking a 4K file on every move stutters on phones.
 */
export type ScrubState = { active: false } | { active: true; wasPlaying: boolean; timeSec: number }

export type ScrubAction =
    | { kind: 'down'; timeSec: number; playing: boolean }
    | { kind: 'move'; timeSec: number }
    | { kind: 'up' }
    | { kind: 'cancel' }

export type ScrubEffect =
    | { kind: 'pause' }
    | { kind: 'preview'; timeSec: number }
    | { kind: 'seek'; timeSec: number }
    | { kind: 'play' }
    | { kind: 'end' }

export const SCRUB_IDLE: ScrubState = { active: false }

export function scrubReducer(state: ScrubState, action: ScrubAction): { state: ScrubState; effects: ScrubEffect[] } {
    switch (action.kind) {
        case 'down': {
            const effects: ScrubEffect[] = action.playing ? [{ kind: 'pause' }] : []
            effects.push({ kind: 'preview', timeSec: action.timeSec })
            return { state: { active: true, wasPlaying: action.playing, timeSec: action.timeSec }, effects }
        }
        case 'move':
            if (!state.active) return { state, effects: [] }
            return { state: { ...state, timeSec: action.timeSec }, effects: [{ kind: 'preview', timeSec: action.timeSec }] }
        case 'up':
        case 'cancel': {
            if (!state.active) return { state, effects: [] }
            const effects: ScrubEffect[] = action.kind === 'up' ? [{ kind: 'seek', timeSec: state.timeSec }] : []
            if (state.wasPlaying) effects.push({ kind: 'play' })
            effects.push({ kind: 'end' })
            return { state: SCRUB_IDLE, effects }
        }
    }
}

/** Time under the finger on a bar spanning `rect`, clamped to [0, duration]. */
export function scrubTimeAt(clientX: number, rect: { left: number; width: number }, durationSec: number): number {
    if (rect.width <= 0) return 0
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return frac * durationSec
}
