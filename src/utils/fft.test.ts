import { describe, expect, it } from 'vitest'
import { powerSpectrum } from './fft'

describe('powerSpectrum', () => {
    it('should put a pure tone in its frequency bin', () => {
        const n = 1024, k = 37
        const frame = new Float32Array(n).map((_, i) => Math.sin((2 * Math.PI * k * i) / n))
        const p = powerSpectrum(frame)
        expect(p.length).toBe(n / 2 + 1)
        const peak = p.indexOf(Math.max(...p))
        expect(peak).toBe(k)
    })
    it('should give zero power for silence', () => {
        expect(Math.max(...powerSpectrum(new Float32Array(256)))).toBe(0)
    })
    it('should reject lengths that are not a power of two', () => {
        expect(() => powerSpectrum(new Float32Array(300))).toThrow()
    })
})
