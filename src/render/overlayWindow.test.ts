import { describe, it, expect } from 'vitest'
import { overlaySpans, type Gop } from './overlayWindow'

// Closed GOPs of 1 s: frames of GOP i display in [i, i+1).
const closed: Gop[] = [0, 1, 2, 3, 4, 5].map((k) => ({ key: k + 10, start: k + 10 }))
// Open GOPs: each key (after the first) has leading pictures displaying 0.1 s before it.
const open: Gop[] = [0, 1, 2, 3, 4, 5].map((k) => ({ key: k + 10, start: k === 0 ? 10 : k + 9.9 }))

describe('overlaySpans', () => {
    it('should re-encode only the GOPs overlapping a window inside the cut', () => {
        expect(overlaySpans(closed, 16, [[11.5, 13.2]])).toEqual([
            { decodeFrom: 1, from: 1, resume: 4, outStart: 11, outEnd: 14, windows: [[11.5, 13.2]] },
        ])
    })

    it('should resume at a key exactly at the window end', () => {
        expect(overlaySpans(closed, 16, [[11, 13]])[0]).toMatchObject({ from: 1, resume: 3, outStart: 11, outEnd: 13 })
    })

    it('should not decode before the cut start', () => {
        expect(overlaySpans(closed, 16, [[10, 11.5]])[0]).toMatchObject({ decodeFrom: 0, from: 0, resume: 2, outStart: 10 })
    })

    it('should run to the cut end when no key follows the window', () => {
        expect(overlaySpans(closed, 16, [[14.5, 17]])[0]).toMatchObject({ from: 4, resume: null, outStart: 14, outEnd: 16, windows: [[14.5, 16]] })
    })

    it('should start decoding a GOP earlier for open-GOP leading pictures', () => {
        expect(overlaySpans(open, 16, [[12.5, 13.5]])[0]).toMatchObject({ decodeFrom: 1, from: 2, resume: 4, outStart: 11.9, outEnd: 14 })
    })

    it('should start at the GOP whose leading pictures hold the window start', () => {
        // 11.95 displays among key 12's leading pictures, which are re-encoded with GOP 2.
        expect(overlaySpans(open, 16, [[11.95, 12.5]])[0]).toMatchObject({ from: 2, outStart: 11.9, resume: 3 })
    })

    it('should merge windows whose GOP ranges touch', () => {
        const spans = overlaySpans(closed, 16, [[10.2, 11.5], [12.1, 12.4]])
        expect(spans).toHaveLength(1)
        expect(spans[0]).toMatchObject({ from: 0, resume: 3, windows: [[10.2, 11.5], [12.1, 12.4]] })
    })

    it('should keep windows apart when a GOP is copied between them', () => {
        expect(overlaySpans(closed, 16, [[10.2, 10.8], [13.1, 13.5]]).map((s) => [s.from, s.resume])).toEqual([[0, 1], [3, 4]])
    })

    it('should ignore windows outside the cut', () => {
        expect(overlaySpans(closed, 16, [[2, 5], [16, 18]])).toEqual([])
    })
})
