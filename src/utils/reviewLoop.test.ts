import { describe, expect, it } from 'vitest'
import { formatReviewWindow, reviewWindow, stepLoop, type LoopState } from './reviewLoop'

const w = { startAbs: 97, endAbs: 102 }
const fresh = (at: number | null = 0): LoopState => ({ released: false, seekingSince: at })

describe('stepLoop', () => {
    it('should ignore stale positions while its own seek is pending, then settle', () => {
        let r = stepLoop(fresh(0), 40, w, 500)
        expect(r).toMatchObject({ loop: false, state: { released: false, seekingSince: 0 } })
        r = stepLoop(r.state, 97.2, w, 800)
        expect(r.state).toEqual({ released: false, seekingSince: null })
    })
    it('should jump back at the end of the window', () => {
        const r = stepLoop({ released: false, seekingSince: null }, 102.1, w, 1000)
        expect(r.loop).toBe(true)
        expect(r.state.seekingSince).toBe(1000)
    })
    it('should release after the user seeks outside the window', () => {
        expect(stepLoop({ released: false, seekingSince: null }, 300, w, 1000).state.released).toBe(true)
        expect(stepLoop({ released: false, seekingSince: null }, 10, w, 1000).state.released).toBe(true)
    })
    it('should release when its own seek never lands', () => {
        expect(stepLoop(fresh(0), 40, w, 3500).state.released).toBe(true)
    })
    it('should stay released', () => {
        const r = stepLoop({ released: true, seekingSince: null }, 102.5, w, 1)
        expect(r.loop).toBe(false)
    })
})

describe('reviewWindow', () => {
    it('should default to -5/+2 and extend by the given amounts', () => {
        expect(reviewWindow(100, [-5, 2], 0, 0, 600)).toEqual({ startAbs: 95, endAbs: 102 })
        expect(reviewWindow(100, [-5, 2], 4, 2, 600)).toEqual({ startAbs: 91, endAbs: 104 })
    })
    it('should clamp to the timeline', () => {
        expect(reviewWindow(3, [-5, 2], 6, 0, 600).startAbs).toBe(0)
        expect(reviewWindow(599, [-5, 2], 0, 10, 600).endAbs).toBe(600)
    })
    it('should format relative offsets', () => {
        expect(formatReviewWindow(100, { startAbs: 91, endAbs: 104 })).toBe('−9 s … +4 s')
    })
})
