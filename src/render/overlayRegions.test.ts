import { describe, it, expect } from 'vitest'
import { overlayRegions } from './overlayRegions'

// key frames every second
const keys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

describe('overlayRegions', () => {
    it('should buffer from the key before the window’s key to two keys after the one at its end', () => {
        expect(overlayRegions(keys, [[4.5, 6.2]])).toEqual([[3, 8]])
    })

    it('should start at the first key when the window is near the start', () => {
        expect(overlayRegions(keys, [[0.2, 1]])).toEqual([[0, 3]])
    })

    it('should run to the end of the cut when there are not enough keys after the window', () => {
        expect(overlayRegions(keys, [[11.5, 12.5]])).toEqual([[10, Infinity]])
    })

    it('should merge windows whose regions touch or overlap', () => {
        expect(overlayRegions(keys, [[2.5, 3], [5.5, 6], [10.5, 11]])).toEqual([[1, 8], [9, Infinity]])
    })

    it('should handle windows given out of order, and windows starting before the first key', () => {
        expect(overlayRegions(keys, [[8, 8.5], [-3, 0.5]])).toEqual([[0, 2], [7, 10]])
    })

    it('should be empty without windows or keys', () => {
        expect(overlayRegions(keys, [])).toEqual([])
        expect(overlayRegions([], [[1, 2]])).toEqual([])
    })
})
