import { describe, expect, it } from 'vitest'
import { detectionRange, runAudioDetection, type DetectDeps } from './runAudioDetection'
import { createFeatureExtractor } from './featureExtractor'
import type { MatchEvent } from '../types'

const SR = 8000
/** Fake decoder: background noise with a shout + hush at `shoutAt` seconds (per file); no audio when shoutAt is null. */
function fakeDecode(plan: Map<File, { sec: number; shoutAt: number | null } | null>): DetectDeps['decode'] {
    return async (file, sink) => {
        const p = plan.get(file)
        if (!p) return false
        let seed = 3
        const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
        const chunk = SR // 1 s chunks
        for (let s = 0; s < p.sec; s++) {
            const a = new Float32Array(chunk)
            const shout = p.shoutAt !== null && s >= p.shoutAt && s < p.shoutAt + 2
            const hush = p.shoutAt !== null && s >= p.shoutAt + 5 && s < p.shoutAt + 15
            for (let i = 0; i < chunk; i++) a[i] = rnd() * (hush ? 0.02 : 0.1) + (shout ? 0.6 * Math.sin((2 * Math.PI * 900 * i) / SR) : 0)
            sink(a, SR, s)
        }
        return true
    }
}
const deps = (plan: Map<File, { sec: number; shoutAt: number | null } | null>): DetectDeps =>
    ({ decode: fakeDecode(plan), extractor: () => createFeatureExtractor({ hopSec: 0.2, voiceHz: [300, 3000] }, false) })

describe('runAudioDetection', () => {
    it('should find a shout in the second file at its timeline position', async () => {
        const a = new File([], 'a'), b = new File([], 'b')
        const plan = new Map([[a, { sec: 120, shoutAt: null }], [b, { sec: 120, shoutAt: 60 }]])
        const progress: number[] = []
        const r = await runAudioDetection([{ file: a, durationSec: 120, offsetSec: 0 }, { file: b, durationSec: 120, offsetSec: 120 }], [0, 240], deps(plan), new AbortController().signal, (f) => progress.push(f))
        expect(Math.abs(r.moments.sort((x, y) => y.score - x.score)[0].timeSec - 180)).toBeLessThanOrEqual(4)
        expect(progress.at(-1)).toBe(1)
        expect(r.analysedSec).toBe(240)
    })
    it('should skip a file without audio and still analyse the others', async () => {
        const a = new File([], 'a'), b = new File([], 'b')
        const plan = new Map<File, { sec: number; shoutAt: number | null } | null>([[a, null], [b, { sec: 120, shoutAt: 40 }]])
        const r = await runAudioDetection([{ file: a, durationSec: 120, offsetSec: 0 }, { file: b, durationSec: 120, offsetSec: 120 }], [0, 240], deps(plan), new AbortController().signal, () => {})
        expect(r.moments.length).toBeGreaterThan(0)
        expect(r.moments.every((m) => m.timeSec >= 120)).toBe(true)
    })
    it('should stop when cancelled', async () => {
        const a = new File([], 'a'); const ac = new AbortController(); ac.abort()
        await expect(runAudioDetection([{ file: a, durationSec: 60, offsetSec: 0 }], [0, 60], deps(new Map([[a, { sec: 60, shoutAt: 10 }]])), ac.signal, () => {})).rejects.toThrow(/cancel/i)
    })
})

describe('detectionRange', () => {
    const ev = (type: MatchEvent['type'], t: number): MatchEvent => ({ id: type, type, matchTimeSec: t, sourceFileIndex: 0 })
    it('should use kick off and final whistle when both are set in order', () => {
        expect(detectionRange([ev('kick_off', 60), ev('final_whistle', 3000)], [0], 3600)).toEqual([60, 3000])
    })
    it('should use the whole timeline without markers or when they are out of order', () => {
        expect(detectionRange([], [0], 3600)).toEqual([0, 3600])
        expect(detectionRange([ev('kick_off', 900), ev('final_whistle', 100)], [0], 3600)).toEqual([0, 3600])
    })
})
