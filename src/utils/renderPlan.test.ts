import { describe, it, expect } from 'vitest'
import { buildRenderPlan } from './renderPlan'
import type { HighlightSegment } from './highlights'

const seg = (sourceFileIndex: number, startTime: number, endTime: number): HighlightSegment => ({
    sourceFileIndex, startTime, endTime, duration: endTime - startTime, goals: [],
})

describe('buildRenderPlan', () => {
    it('should return no cuts for no segments', () => {
        expect(buildRenderPlan([], [100])).toEqual([])
    })

    it('should map a single-file segment to one cut', () => {
        expect(buildRenderPlan([seg(0, 50, 64)], [100])).toEqual([{ sourceIndex: 0, startSec: 50, endSec: 64 }])
    })

    it('should clamp to file bounds', () => {
        expect(buildRenderPlan([seg(0, -3, 11)], [100])).toEqual([{ sourceIndex: 0, startSec: 0, endSec: 11 }])
        expect(buildRenderPlan([seg(0, 95, 104)], [100])).toEqual([{ sourceIndex: 0, startSec: 95, endSec: 100 }])
    })

    it('should split a cross-file segment into previous-file tail and current-file head', () => {
        expect(buildRenderPlan([seg(1, -6, 8)], [100, 200])).toEqual([
            { sourceIndex: 0, startSec: 94, endSec: 100 },
            { sourceIndex: 1, startSec: 0, endSec: 8 },
        ])
    })

    it('should drop zero-length cuts', () => {
        expect(buildRenderPlan([seg(0, 100, 104)], [100])).toEqual([])
    })
})
