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
        expect(etaSeconds(s)).toBeCloseTo(96, 5)
    })
    it('should ignore samples closer than half a second', () => {
        const a = run([[0, 0], [2, 0.02]])!
        expect(stepEta(a, 2100, 0.5)).toBe(a)
    })
    it('should format minutes, hours and the last minute', () => {
        expect(formatEta(null)).toBeNull()
        expect(formatEta(30)).toBe('under a minute left')
        expect(formatEta(12 * 60 + 10)).toBe('about 12 min left')
        expect(formatEta(65 * 60)).toBe('about 1 h 5 min left')
        expect(formatEta(120 * 60)).toBe('about 2 h left')
    })
})
