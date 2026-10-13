import { describe, expect, it } from 'vitest'
import { etaSeconds, formatEta, stepEta, type EtaState } from './renderEta'

const run = (points: [number, number][]): EtaState | null => points.reduce<EtaState | null>((s, [t, f]) => stepEta(s, t * 1000, f), null)

describe('render ETA', () => {
    it('should say nothing until a few seconds of progress exist', () => {
        expect(etaSeconds(null)).toBeNull()
        expect(etaSeconds(run([[0, 0], [1, 0.01], [2, 0.02]]))).toBeNull()
    })
    it('should extrapolate a steady rate', () => {
        const pts: [number, number][] = Array.from({ length: 11 }, (_, i) => [i, i * 0.01])
        expect(etaSeconds(run(pts))).toBeCloseTo(90, 5) // 10% in 10 s: 90 s left
    })
    it('should follow a slowdown through the moving average rather than jump to it', () => {
        const steady: [number, number][] = Array.from({ length: 11 }, (_, i) => [i, i * 0.01])
        const slow = run([...steady, [11, 0.105]])!
        const fast = run(steady)!
        expect(slow.rate!).toBeLessThan(fast.rate!)
        expect(slow.rate!).toBeGreaterThan(0.005)
    })
    it('should ignore ticks with no progress without losing the rate', () => {
        const s = run([[0, 0], [2, 0.02], [4, 0.04], [6, 0.04], [8, 0.04]])!
        expect(s.rate).toBeCloseTo(0.01, 5)
        // The stall counts a little (averaged with the whole-run rate), but the ETA is not dragged to infinity.
        expect(etaSeconds(s)!).toBeGreaterThan(96)
        expect(etaSeconds(s)!).toBeLessThan(140)
    })
    it('should ignore samples closer than half a second', () => {
        const a = run([[0, 0], [2, 0.02]])!
        expect(stepEta(a, 2100, 0.5)).toBe(a)
    })
    it('should blend the model total in early and trust the observation as progress grows', () => {
        const steady = (priorSec: number | null, upto: number): EtaState | null =>
            Array.from({ length: upto + 1 }, (_, i) => i).reduce<EtaState | null>((st, i) => stepEta(st, i * 1000, i * 0.005, priorSec), null)
        // Truth: 200 s total (0.5% per second). A prior of 100 s is far off; the blend starts between and converges on the truth.
        const early = etaSeconds(steady(100, 10))! // 5% done
        const late = etaSeconds(steady(100, 100))! // 50% done
        expect(early).toBeGreaterThan(100 * 0.95) // pulled towards the prior's 95 s but not equal to the observed 190 s
        expect(early).toBeLessThan(190)
        expect(Math.abs(late - 100)).toBeLessThan(Math.abs(etaSeconds(steady(null, 100))! - 100) + 20)
        expect(late).toBeGreaterThan(70)
        expect(etaSeconds(steady(null, 10))).toBeCloseTo(190, 0)
        // A good prior is exact from the start.
        expect(etaSeconds(steady(200, 10))).toBeCloseTo(190, 0)
    })
    it('should stay within 30% on a fast copy phase followed by a slow re-encode, where media-time progress was far off', () => {
        // Media: 80% copied in the first 20 s, the last 20% re-encoded over 180 s. Work-weighted progress is steady at 0.5% per second.
        const mediaFraction = (t: number): number => (t <= 20 ? (t / 20) * 0.8 : 0.8 + ((t - 20) / 180) * 0.2)
        const workFraction = (t: number): number => t / 200
        const trace = (frac: (t: number) => number, prior: number | null): { t: number; eta: number | null }[] => {
            let st: EtaState | null = null
            const out: { t: number; eta: number | null }[] = []
            for (let t = 0; t <= 200; t++) {
                st = stepEta(st, t * 1000, Math.min(1, frac(t)), prior)
                if (t > 0 && t % 10 === 0) out.push({ t, eta: etaSeconds(st) })
            }
            return out
        }
        const old = trace(mediaFraction, null).find((p) => p.t === 30)!
        expect(old.eta!).toBeLessThan(0.5 * 170) // the old algorithm: far too optimistic (truth 170 s left)
        for (const prior of [200, 130, 260]) { // the model may be 35% off either way
            for (const p of trace(workFraction, prior)) {
                if (p.t < 20 || p.t > 190) continue
                const truth = 200 - p.t
                expect(Math.abs(p.eta! - truth) / truth, `t=${p.t} prior=${prior}`).toBeLessThan(0.3)
            }
        }
    })
    it('should format minutes, hours and the last minute', () => {
        expect(formatEta(null)).toBeNull()
        expect(formatEta(30)).toBe('under a minute left')
        expect(formatEta(12 * 60 + 10)).toBe('about 12 min left')
        expect(formatEta(65 * 60)).toBe('about 1 h 5 min left')
        expect(formatEta(120 * 60)).toBe('about 2 h left')
    })
})
