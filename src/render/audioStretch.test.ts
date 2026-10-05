import { describe, it, expect } from 'vitest'
import { timeStretch } from './audioStretch'

const RATE = 48000

/** Interleaved sine(s): one frequency per channel. */
function sines(freqs: number[], seconds: number, amp = 0.5): Float32Array {
    const n = Math.round(seconds * RATE)
    const ch = freqs.length
    const out = new Float32Array(n * ch)
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out[i * ch + c] = amp * Math.sin((2 * Math.PI * freqs[c] * i) / RATE)
    return out
}

function channel(samples: Float32Array, ch: number, c: number): Float32Array {
    const out = new Float32Array(samples.length / ch)
    for (let i = 0; i < out.length; i++) out[i] = samples[i * ch + c]
    return out
}

/** Dominant frequency of the middle half, from zero crossings. */
function frequency(x: Float32Array): number {
    const a = Math.floor(x.length / 4)
    const b = Math.floor((x.length * 3) / 4)
    let crossings = 0
    for (let i = a + 1; i < b; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) crossings++
    return crossings / 2 / ((b - a) / RATE)
}

function rms(x: Float32Array): number {
    const a = Math.floor(x.length / 4)
    const b = Math.floor((x.length * 3) / 4)
    let sum = 0
    for (let i = a; i < b; i++) sum += x[i] * x[i]
    return Math.sqrt(sum / (b - a))
}

describe('timeStretch', () => {
    it.each([0.5, 0.25])('should make the output about input / %s long', (speed) => {
        const input = sines([440, 660], 1)
        const out = timeStretch(input, 2, speed)
        expect(out.length / 2).toBe(Math.round(RATE / speed))
    })

    it.each([[440, 0.5], [1000, 0.5], [440, 0.25], [220, 0.25]])('should keep a %s Hz tone at its pitch when slowed to %s×', (hz, speed) => {
        const out = timeStretch(sines([hz], 1), 1, speed)
        const f = frequency(out)
        expect(Math.abs(f - hz) / hz).toBeLessThan(0.02)
    })

    it('should keep the channels apart and in pitch', () => {
        const out = timeStretch(sines([440, 660], 1), 2, 0.5)
        expect(Math.abs(frequency(channel(out, 2, 0)) - 440) / 440).toBeLessThan(0.02)
        expect(Math.abs(frequency(channel(out, 2, 1)) - 660) / 660).toBeLessThan(0.02)
    })

    it('should roughly keep the loudness', () => {
        const input = sines([440], 1)
        const out = timeStretch(input, 1, 0.5)
        expect(rms(out) / rms(input)).toBeGreaterThan(0.85)
        expect(rms(out) / rms(input)).toBeLessThan(1.15)
    })

    it('should return a copy at speed 1 and nothing for no input', () => {
        const input = sines([440], 0.1)
        const out = timeStretch(input, 1, 1)
        expect(out).toEqual(input)
        expect(out).not.toBe(input)
        expect(timeStretch(new Float32Array(0), 2, 0.5)).toHaveLength(0)
    })

    it('should cope with input shorter than one analysis frame', () => {
        const out = timeStretch(sines([440], 0.01), 1, 0.5)
        expect(out.length).toBe(Math.round(480 / 0.5))
    })
})
