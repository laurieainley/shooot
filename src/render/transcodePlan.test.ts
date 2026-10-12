import { describe, expect, it } from 'vitest'
import { aacConfig, cutFrames, keyEvery, outputDimensions, outputFrameSec, planSegments, sourceTimeOf } from './transcodePlan'

describe('outputDimensions', () => {
    it('should keep 4K footage at 3840x2160 and halve it for 1080p', () => {
        expect(outputDimensions('4k', 3840, 2160)).toEqual({ width: 3840, height: 2160 })
        expect(outputDimensions('1080p', 3840, 2160)).toEqual({ width: 1920, height: 1080 })
    })
    it('should scale by the long side so portrait footage stays portrait, with even sides', () => {
        expect(outputDimensions('1080p', 2160, 3840)).toEqual({ width: 1080, height: 1920 })
        const d = outputDimensions('1080p', 4096, 2160)
        expect(d.width).toBe(1920)
        expect(d.height % 2).toBe(0)
    })
})

describe('outputFrameSec', () => {
    it('should snap the footage rate to a standard one', () => {
        expect(outputFrameSec(29.97)).toBeCloseTo(1001 / 30000, 6)
        expect(outputFrameSec(30)).toBeCloseTo(1 / 30, 6)
        expect(outputFrameSec(25)).toBeCloseTo(1 / 25, 6)
    })
    it('should halve 50 and 60 fps footage and default to 30 when unknown', () => {
        expect(outputFrameSec(60)).toBeCloseTo(1 / 30, 6)
        expect(outputFrameSec(59.94)).toBeCloseTo(1001 / 30000, 6)
        expect(outputFrameSec(0)).toBeCloseTo(1 / 30, 6)
    })
    it('should put a key frame about every 2 s', () => {
        expect(keyEvery(1 / 30)).toBe(60)
        expect(keyEvery(1001 / 30000)).toBe(60)
    })
})

describe('planSegments', () => {
    it('should split a cut into segments of at most the given length that cover every frame once', () => {
        const segs = planSegments([{ startSec: 0, endSec: 100 }], 0.1, 300)
        expect(segs.map((s) => s.frames)).toEqual([300, 300, 300, 100])
        expect(segs.map((s) => s.firstFrame)).toEqual([0, 300, 600, 900])
        expect(segs.reduce((a, s) => a + s.frames, 0)).toBe(1000)
    })
    it('should plan a slowed cut by its output length', () => {
        expect(cutFrames({ startSec: 10, endSec: 15, speed: 0.5 }, 0.1)).toBe(100)
        expect(planSegments([{ startSec: 0, endSec: 10 }, { startSec: 4, endSec: 5, speed: 0.5 }], 0.5, 1000).map((s) => [s.cutIndex, s.frames])).toEqual([[0, 20], [1, 4]])
    })
    it('should give a very short cut one frame', () => {
        expect(planSegments([{ startSec: 1, endSec: 1.001 }], 1 / 30, 100)).toEqual([{ cutIndex: 0, firstFrame: 0, frames: 1 }])
    })
    it('should map output frames back to source time at the cut speed', () => {
        expect(sourceTimeOf({ startSec: 10, endSec: 20 }, 30, 1 / 30)).toBeCloseTo(11, 6)
        expect(sourceTimeOf({ startSec: 10, endSec: 20, speed: 0.5 }, 30, 1 / 30)).toBeCloseTo(10.5, 6)
    })
})

describe('aacConfig', () => {
    it('should build the AAC-LC AudioSpecificConfig', () => {
        expect([...aacConfig(48000, 2)]).toEqual([0x11, 0x90])
        expect([...aacConfig(44100, 2)]).toEqual([0x12, 0x10])
        expect([...aacConfig(48000, 1)]).toEqual([0x11, 0x88])
    })
    it('should refuse an unsupported rate', () => {
        expect(() => aacConfig(12345, 2)).toThrow()
    })
})
