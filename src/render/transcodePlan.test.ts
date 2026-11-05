import { describe, expect, it } from 'vitest'
import { aacConfig, cutFrames, gridBlockFrames, gridSegments, gridSpan, keyEvery, outputDimensions, outputFrameSec, planFrames, planSegments, segmentSpan, sourceTimeOf } from './transcodePlan'

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

describe('planSegments (balanced for parallel units)', () => {
    const frames = (segs: { frames: number }[]): number[] => segs.map((s) => s.frames)
    it('should cut a cut into equal pieces instead of leaving a short tail', () => {
        const segs = planSegments([{ startSec: 0, endSec: 130 }], 0.1, 1200, { units: 2, minFrames: 100 })
        expect(frames(segs)).toEqual([650, 650])
        expect(segs.map((s) => s.firstFrame)).toEqual([0, 650])
    })
    it('should split a lone short cut in two so there is something to run side by side', () => {
        const segs = planSegments([{ startSec: 0, endSec: 60 }], 0.1, 1200, { units: 2, minFrames: 100 })
        expect(frames(segs)).toEqual([300, 300])
    })
    it('should give a two-cut reel one unit per cut and not split cuts that are short', () => {
        const segs = planSegments([{ startSec: 0, endSec: 12 }, { startSec: 50, endSec: 58 }], 0.1, 1200, { units: 2, minFrames: 100 })
        expect(segs.map((s) => [s.cutIndex, s.frames])).toEqual([[0, 120], [1, 80]])
    })
    it('should leave a cut shorter than twice the minimum in one piece', () => {
        expect(frames(planSegments([{ startSec: 0, endSec: 15 }], 0.1, 1200, { units: 2, minFrames: 100 }))).toEqual([150])
    })
    it('should give a full match of 90 minutes 45 units of 2 minutes, covering every frame once', () => {
        const segs = planSegments([{ startSec: 0, endSec: 5400 }], 1 / 30, 3600, { units: 2, minFrames: 300 })
        expect(segs).toHaveLength(45)
        expect(segs.reduce((a, s) => a + s.frames, 0)).toBe(162000)
        segs.forEach((s, i) => expect(s.firstFrame).toBe(i === 0 ? 0 : segs[i - 1].firstFrame + segs[i - 1].frames))
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

describe('stableSegments', () => {
    it('should split each cut on its own so editing one cut never moves another cut\'s units', () => {
        const a = planSegments([{ startSec: 0, endSec: 300 }, { startSec: 0, endSec: 100 }], 0.5, 240, { units: 2, minFrames: 20, stable: true })
        const b = planSegments([{ startSec: 0, endSec: 250 }, { startSec: 0, endSec: 100 }], 0.5, 240, { units: 2, minFrames: 20, stable: true })
        const second = (x: typeof a) => x.filter((s) => s.cutIndex === 1)
        expect(second(a)).toEqual(second(b))
        expect(a.filter((s) => s.cutIndex === 0).map((s) => s.frames)).toEqual([240, 240, 120])
    })
    it('should join a short tail to the piece before it', () => {
        const s = planSegments([{ startSec: 0, endSec: 125 }], 0.5, 240, { units: 1, minFrames: 20, stable: true })
        expect(s.map((x) => x.frames)).toEqual([250])
    })
    it('should still split a short render so units can run side by side', () => {
        const s = planSegments([{ startSec: 0, endSec: 40 }], 0.5, 240, { units: 2, minFrames: 20, stable: true })
        expect(s.length).toBe(2)
        expect(s.reduce((a, x) => a + x.frames, 0)).toBe(80)
    })
})

describe('gridBlockFrames', () => {
    it('should be about 10 s in whole key-frame intervals', () => {
        expect(gridBlockFrames(1001 / 30000, 60, null)).toBe(300)
        expect(gridBlockFrames(1 / 25, 50, null)).toBe(250)
        expect(gridBlockFrames(1 / 30, 60, { sampleRate: 48000, exact: false })).toBe(300)
    })
    it('should be a whole number of AAC frames when the audio is built per block, or every join would drift', () => {
        for (const [fs, rate] of [[1001 / 30000, 48000], [1 / 30, 48000], [1 / 25, 48000], [1 / 24, 48000]] as const) {
            const n = gridBlockFrames(fs, 60, { sampleRate: rate, exact: true })
            const aac = (n * fs * rate) / 1024
            expect(Math.abs(aac - Math.round(aac))).toBeLessThan(1e-6)
            expect(n * fs).toBeGreaterThanOrEqual(10 - fs)
            expect(n * fs).toBeLessThanOrEqual(30)
        }
        expect(gridBlockFrames(1001 / 30000, 60, { sampleRate: 48000, exact: true })).toBe(640)
    })
    it('should fall back to ~20 s blocks when no length is a whole number of AAC frames (44.1 kHz with 29.97 fps)', () => {
        const n = gridBlockFrames(1001 / 30000, 60, { sampleRate: 44100, exact: true })
        expect(n * (1001 / 30000)).toBeGreaterThan(15)
        expect(n * (1001 / 30000)).toBeLessThan(25)
    })
})

describe('gridSegments', () => {
    const FS = 1001 / 30000
    const N = 300
    const cover = (segs: ReturnType<typeof gridSegments>, ci: number): number[] => segs.filter((s) => s.cutIndex === ci).flatMap((s) => Array.from({ length: s.frames }, (_, j) => s.grid! + j))

    it('should cut a speed-1 cut on multiples of the block size of the SOURCE frame numbers, covering each frame inside it once', () => {
        const c = { startSec: 123.4, endSec: 163.2 }
        const segs = gridSegments([c], FS, N, 3600)
        const { first, end } = gridSpan(c, FS)
        expect(cover(segs, 0)).toEqual(Array.from({ length: end - first }, (_, i) => first + i))
        for (const s of segs.slice(0, -1)) expect((s.grid! + s.frames) % N).toBe(0)
        for (const s of segs.slice(1)) expect(s.grid! % N).toBe(0)
        expect(segs[0].firstFrame).toBe(0)
        expect(segs.map((s) => s.firstFrame)).toEqual(segs.map((s) => s.grid! - first))
    })
    it('should keep every interior block exactly as it was when the cut starts or ends elsewhere', () => {
        const interior = (c: { startSec: number; endSec: number }) => gridSegments([c], FS, N, 3600).filter((s) => s.frames === N).map((s) => [s.grid, s.frames])
        const a = interior({ startSec: 120, endSec: 600 })
        const b = interior({ startSec: 133.3, endSec: 590.7 })
        const common = a.filter((x) => b.some((y) => y[0] === x[0]))
        expect(common.length).toBeGreaterThan(a.length - 4)
        expect(common.length).toBe(b.length)
    })
    it('should split a cut into two without touching the blocks away from the split (an inserted replay)', () => {
        const whole = gridSegments([{ startSec: 100, endSec: 500 }], FS, N, 3600)
        const split = gridSegments([{ startSec: 100, endSec: 301.5 }, { startSec: 290, endSec: 295, speed: 0.5 }, { startSec: 301.5, endSec: 500 }], FS, N, 3600)
        const blocks = (s: typeof whole) => new Set(s.filter((x) => x.frames === N && x.grid !== undefined).map((x) => x.grid))
        const lost = [...blocks(whole)].filter((g) => !blocks(split).has(g))
        expect(lost.length).toBeLessThanOrEqual(1) // only the block the split falls in
    })
    it('should plan a slowed cut from its own start in pieces, off the grid', () => {
        const segs = gridSegments([{ startSec: 10, endSec: 20, speed: 0.5 }], FS, N, 100)
        expect(segs.every((s) => s.grid === undefined)).toBe(true)
        expect(segs.reduce((a, s) => a + s.frames, 0)).toBe(cutFrames({ startSec: 10, endSec: 20, speed: 0.5 }, FS))
        expect(Math.max(...segs.map((s) => s.frames))).toBeLessThanOrEqual(100)
    })
    it('should give a very short cut one frame, and a cut inside one block a single partial block', () => {
        expect(gridSegments([{ startSec: 5.001, endSec: 5.002 }], FS, N, 3600)).toHaveLength(1)
        const one = gridSegments([{ startSec: 21, endSec: 25 }], FS, N, 3600)
        expect(one).toHaveLength(1)
        expect(one[0].frames).toBeGreaterThan(100)
    })
    it('should tile a whole match with equal blocks, and cover the same frames in total whatever the start', () => {
        const total = (c: { startSec: number; endSec: number }): number => gridSegments([c], FS, N, 3600).reduce((a, s) => a + s.frames, 0)
        const first = (t: number): number => gridSpan({ startSec: t, endSec: 6700 }, FS).first
        expect(total({ startSec: 120, endSec: 6700 }) - total({ startSec: 123.3, endSec: 6700 })).toBe(first(123.3) - first(120))
        expect(planFrames({ startSec: 0, endSec: 1 }, 0.25)).toBe(4)
    })
})

describe('segmentSpan', () => {
    it('should give a block its own source frames and a timed segment its cut-relative span', () => {
        expect(segmentSpan({ startSec: 3, endSec: 9 }, { cutIndex: 0, firstFrame: 2, frames: 30, grid: 300 }, 0.1)).toEqual({ a: 30, b: 33 })
        const s = segmentSpan({ startSec: 10, endSec: 20, speed: 0.5 }, { cutIndex: 0, firstFrame: 20, frames: 40 }, 0.1)
        expect(s.a).toBeCloseTo(11, 6)
        expect(s.b).toBeCloseTo(13, 6)
    })
})
