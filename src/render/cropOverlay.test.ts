import { describe, it, expect } from 'vitest'
import { cropOverlayFor, cropLabels } from './cropOverlay'
import type { Cut } from './types'

const box = { x: 0.1, y: 0.3, w: 0.4, h: 0.4 }
const cut: Cut = { sourceIndex: 0, startSec: 10, endSec: 15, speed: 0.5, gain: 0.5, crop: box, cropLabel: 'Replay zoom: Goal 0:00:12' }

describe('cropOverlayFor', () => {
    it('should cover every frame of the cut from its real start, however long the GOPs make it', () => {
        const o = cropOverlayFor(cut, 3, 9.5, 16)
        expect(o.cutIndex).toBe(3)
        expect(o.startSec).toBe(9.5)
        expect(o.startSec + o.durationSec).toBeGreaterThan(16)
        expect(o.crop).toEqual(box)
        expect(o.label).toBe('Replay zoom: Goal 0:00:12')
    })
    it('should not touch any rows (the crop replaces the picture, nothing is drawn over it)', () => {
        const o = cropOverlayFor(cut, 0, 10, 15)
        expect(o.rows(1920, 1080)).toEqual([0, 0])
    })
    it('should name itself when the cut has no label', () => {
        expect(cropOverlayFor({ ...cut, cropLabel: undefined }, 0, 10, 15).label).toBe('Replay zoom')
    })
})

describe('cropLabels', () => {
    it('should list the crops of the cuts, once each', () => {
        expect(cropLabels([cut, { sourceIndex: 0, startSec: 0, endSec: 5 }, { ...cut }])).toEqual(['Replay zoom: Goal 0:00:12', 'Replay zoom: Goal 0:00:12'])
    })
})
