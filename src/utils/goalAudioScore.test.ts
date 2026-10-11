import { describe, expect, it } from 'vitest'
import { goalScores, movingAverage, pickMoments, placeOnTimeline, robustZ } from './goalAudioScore'
import type { AudioFeatures } from './audioFeatures'

const HOP = 0.2
const CFG = { smoothSec: 1, peakWindowSec: [-3, 3] as const, hushWindowSec: [5, 15] as const }
let seed = 7
const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

/** Steady background with optional events: shout = voice and loudness up; hush = loudness down. */
function match(sec: number, events: { at: number; shout: number; hushFor: number }[], gainDb = 0): AudioFeatures {
    const n = Math.round(sec / HOP), loud = new Float32Array(n), voice = new Float32Array(n)
    for (let i = 0; i < n; i++) { const b = -30 + gainDb + rnd() * 2; loud[i] = b; voice[i] = b - 3 + rnd() }
    for (const e of events) {
        const i0 = Math.round(e.at / HOP)
        for (let i = i0; i < i0 + 10 && i < n; i++) { loud[i] += e.shout; voice[i] += e.shout + 2 }
        for (let i = i0 + 25; i < i0 + 25 + e.hushFor / HOP && i < n; i++) loud[i] -= 8
    }
    return { hopSec: HOP, loudDb: loud, voiceDb: voice }
}

describe('movingAverage', () => {
    it('should average a centred window and keep the length', () => {
        expect(Array.from(movingAverage(new Float32Array([0, 0, 3, 0, 0]), 3))).toEqual([0, 1, 1, 1, 0])
    })
})

describe('robustZ', () => {
    it('should centre on the median and map NaN to 0', () => {
        const z = robustZ(new Float32Array([1, 2, 3, 4, 100, NaN]))
        expect(z[2]).toBeCloseTo(0)
        expect(z[5]).toBe(0)
        expect(z[4]).toBeGreaterThan(10)
    })
})

describe('goalScores + pickMoments', () => {
    it('should rank a shout followed by a hush first', () => {
        const f = match(600, [{ at: 100, shout: 12, hushFor: 10 }, { at: 300, shout: 12, hushFor: 0 }])
        const m = pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 1, startSec: 0, endSec: 600 })
        expect(Math.abs(m[0].timeSec - 101)).toBeLessThanOrEqual(4)
    })
    it('should not depend on overall gain', () => {
        const ev = [{ at: 120, shout: 10, hushFor: 10 }, { at: 400, shout: 9, hushFor: 10 }]
        seed = 7; const a = match(600, ev); seed = 7; const b = match(600, ev, 25)
        const opts = { minGapSec: 20, max: 5, startSec: 0, endSec: 600 }
        expect(pickMoments(goalScores(b, CFG), HOP, opts).map((x) => x.timeSec)).toEqual(pickMoments(goalScores(a, CFG), HOP, opts).map((x) => x.timeSec))
    })
    it('should keep picks at least minGapSec apart, within range, at most max, sorted by time', () => {
        const f = match(900, [{ at: 100, shout: 12, hushFor: 10 }, { at: 110, shout: 12, hushFor: 10 }, { at: 500, shout: 12, hushFor: 10 }])
        const m = pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 30, startSec: 50, endSec: 800 })
        for (let i = 1; i < m.length; i++) expect(m[i].timeSec - m[i - 1].timeSec).toBeGreaterThanOrEqual(20)
        expect(m.every((x) => x.timeSec >= 50 && x.timeSec <= 800)).toBe(true)
        expect(m.length).toBeLessThanOrEqual(30)
        expect(pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 2, startSec: 0, endSec: 900 }).length).toBe(2)
    })
    it('should return nothing for an empty or out-of-range span', () => {
        expect(pickMoments(new Float32Array(0), HOP, { minGapSec: 20, max: 30, startSec: 0, endSec: 100 })).toEqual([])
        const f = match(100, [])
        expect(pickMoments(goalScores(f, CFG), HOP, { minGapSec: 20, max: 30, startSec: 200, endSec: 300 })).toEqual([])
    })
})

describe('placeOnTimeline', () => {
    it('should put each file at its offset and leave gaps as NaN', () => {
        const a = { hopSec: HOP, loudDb: new Float32Array([1, 1]), voiceDb: new Float32Array([1, 1]) }
        const t = placeOnTimeline([{ features: a, offsetSec: 0 }, { features: a, offsetSec: 1 }], 1.4, HOP)
        expect(t.loudDb.length).toBe(7)
        expect(t.loudDb[0]).toBe(1); expect(t.loudDb[5]).toBe(1); expect(Number.isNaN(t.loudDb[3])).toBe(true)
    })
})
