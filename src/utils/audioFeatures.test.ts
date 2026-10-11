import { describe, expect, it } from 'vitest'
import { downmix, downmixInto, FeatureAccumulator } from './audioFeatures'

const tone = (hz: number, sr: number, sec: number, amp = 0.5): Float32Array =>
    new Float32Array(Math.round(sr * sec)).map((_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr))

describe('downmix', () => {
    it('should average interleaved channels', () => {
        expect(Array.from(downmix(new Float32Array([1, 0, 0.5, 0.5]), 2))).toEqual([0.5, 0.5])
    })
    it('should return a copy for mono', () => {
        const a = new Float32Array([0.1, 0.2])
        const m = downmix(a, 1)
        expect(Array.from(m)).toEqual(Array.from(a))
        expect(m).not.toBe(a)
    })
})

describe('FeatureAccumulator', () => {
    it('should emit one frame per whole hop', () => {
        const acc = new FeatureAccumulator(16000, 0.2, [300, 3000])
        acc.push(tone(1000, 16000, 1.1))
        const f = acc.finish()
        expect(f.loudDb.length).toBe(5)
        expect(f.voiceDb.length).toBe(5)
        expect(f.hopSec).toBe(0.2)
    })
    it('should count a 1 kHz tone as voice band and a 6 kHz tone as not', () => {
        const a = new FeatureAccumulator(48000, 0.2, [300, 3000]); a.push(tone(1000, 48000, 1))
        const b = new FeatureAccumulator(48000, 0.2, [300, 3000]); b.push(tone(6000, 48000, 1))
        const fa = a.finish(), fb = b.finish()
        expect(fa.loudDb[2] - fa.voiceDb[2]).toBeLessThan(1)
        expect(fb.loudDb[2] - fb.voiceDb[2]).toBeGreaterThan(20)
    })
    it('should not depend on how the samples are chunked', () => {
        const sig = tone(800, 16000, 2)
        const one = new FeatureAccumulator(16000, 0.2, [300, 3000]); one.push(sig)
        const many = new FeatureAccumulator(16000, 0.2, [300, 3000])
        for (let i = 0; i < sig.length; i += 777) many.push(sig.subarray(i, i + 777))
        expect(Array.from(many.finish().loudDb)).toEqual(Array.from(one.finish().loudDb))
    })
    it('should give finite values for silence', () => {
        const acc = new FeatureAccumulator(16000, 0.2, [300, 3000]); acc.push(new Float32Array(16000))
        expect(acc.finish().loudDb.every(Number.isFinite)).toBe(true)
    })
})

describe('downmixInto', () => {
    it('should write the same values as downmix at an offset and return the frame count', () => {
        const x = new Float32Array([1, 0, 0.5, 0.5, 0.25, 0.75])
        const out = new Float32Array(5)
        expect(downmixInto(x, 2, out, 2)).toBe(3)
        expect(Array.from(out)).toEqual([0, 0, ...Array.from(downmix(x, 2))])
    })
})

describe('FeatureAccumulator batching', () => {
    it('should give identical features whether samples arrive in 1000-sample, 2 s or one chunk', () => {
        const sr = 8000, n = sr * 9
        const x = new Float32Array(n).map((_, i) => Math.sin(i * 0.05) * (1 + Math.sin(i / 3000)) + ((i * 7919) % 13) / 100)
        const run = (size: number): { loudDb: Float32Array; voiceDb: Float32Array } => {
            const acc = new FeatureAccumulator(sr, 0.2, [300, 3000])
            for (let i = 0; i < n; i += size) acc.push(x.slice(i, i + size))
            return acc.finish()
        }
        const small = run(1000), batched = run(2 * sr + 123), one = run(n)
        expect(batched.loudDb).toEqual(small.loudDb)
        expect(batched.voiceDb).toEqual(small.voiceDb)
        expect(one.loudDb).toEqual(small.loudDb)
    })
})
