import { describe, it, expect } from 'vitest'
import { SCRUB_IDLE, scrubReducer, scrubTimeAt, type ScrubAction, type ScrubEffect, type ScrubState } from './scrub'

function run(actions: ScrubAction[], start: ScrubState = SCRUB_IDLE): { state: ScrubState; effects: ScrubEffect[] } {
    let state = start
    const effects: ScrubEffect[] = []
    for (const a of actions) {
        const r = scrubReducer(state, a)
        state = r.state
        effects.push(...r.effects)
    }
    return { state, effects }
}
const seeks = (fx: ScrubEffect[]): ScrubEffect[] => fx.filter((e) => e.kind === 'seek')

describe('scrubReducer', () => {
    it('should not seek while dragging, only preview the time', () => {
        const { state, effects } = run([{ kind: 'down', timeSec: 10, playing: false }, { kind: 'move', timeSec: 20 }, { kind: 'move', timeSec: 30 }])
        expect(seeks(effects)).toEqual([])
        expect(effects.filter((e) => e.kind === 'preview')).toEqual([{ kind: 'preview', timeSec: 10 }, { kind: 'preview', timeSec: 20 }, { kind: 'preview', timeSec: 30 }])
        expect(state).toEqual({ active: true, wasPlaying: false, timeSec: 30 })
    })

    it('should seek exactly once on release, to the last position', () => {
        const { state, effects } = run([{ kind: 'down', timeSec: 10, playing: false }, { kind: 'move', timeSec: 42 }, { kind: 'up' }])
        expect(seeks(effects)).toEqual([{ kind: 'seek', timeSec: 42 }])
        expect(effects.at(-1)).toEqual({ kind: 'end' })
        expect(state).toEqual(SCRUB_IDLE)
    })

    it('should pause while dragging and resume after the seek if it was playing', () => {
        const { effects } = run([{ kind: 'down', timeSec: 10, playing: true }, { kind: 'move', timeSec: 12 }, { kind: 'up' }])
        expect(effects[0]).toEqual({ kind: 'pause' })
        const kinds = effects.map((e) => e.kind)
        expect(kinds.slice(-3)).toEqual(['seek', 'play', 'end'])
    })

    it('should stay paused after the seek if it was paused', () => {
        const { effects } = run([{ kind: 'down', timeSec: 10, playing: false }, { kind: 'up' }])
        expect(effects.map((e) => e.kind)).toEqual(['preview', 'seek', 'end'])
    })

    it('should not seek on cancel, but restore playback', () => {
        const { effects } = run([{ kind: 'down', timeSec: 10, playing: true }, { kind: 'move', timeSec: 50 }, { kind: 'cancel' }])
        expect(seeks(effects)).toEqual([])
        expect(effects.map((e) => e.kind).slice(-2)).toEqual(['play', 'end'])
    })

    it('should ignore moves and releases when no drag is active', () => {
        expect(run([{ kind: 'move', timeSec: 5 }, { kind: 'up' }]).effects).toEqual([])
    })
})

describe('scrubTimeAt', () => {
    it('should map a finger position on the bar to a time, clamped to the bar', () => {
        expect(scrubTimeAt(150, { left: 100, width: 200 }, 600)).toBe(150)
        expect(scrubTimeAt(50, { left: 100, width: 200 }, 600)).toBe(0)
        expect(scrubTimeAt(400, { left: 100, width: 200 }, 600)).toBe(600)
        expect(scrubTimeAt(150, { left: 100, width: 0 }, 600)).toBe(0)
    })
})
