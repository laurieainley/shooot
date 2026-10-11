import { powerSpectrum } from './fft'

/** Loudness and voice-band energy (dB) per hop of a whole file. */
export type AudioFeatures = { hopSec: number; loudDb: Float32Array; voiceDb: Float32Array }

/** Mono from interleaved samples (average of the channels); always a new array. */
export function downmix(interleaved: Float32Array, channels: number): Float32Array {
    if (channels <= 1) return interleaved.slice()
    const n = Math.floor(interleaved.length / channels), out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        let s = 0
        for (let c = 0; c < channels; c++) s += interleaved[i * channels + c]
        out[i] = s / channels
    }
    return out
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)))

/**
 * Streams mono samples into fixed hops (Hann-windowed, zero-padded to a power of two) and keeps, per hop, the total
 * power and the power inside `voiceHz`, in dB. Chunk boundaries do not change the result; a trailing partial hop is dropped.
 */
export class FeatureAccumulator {
    private readonly hopSec: number
    private readonly hop: number
    private readonly fftSize: number
    private readonly window: Float32Array
    private readonly lo: number
    private readonly hi: number
    private readonly buf: Float32Array
    private fill = 0
    private readonly loud: number[] = []
    private readonly voice: number[] = []

    constructor(sampleRate: number, hopSec: number, voiceHz: readonly [number, number]) {
        this.hopSec = hopSec
        this.hop = Math.max(2, Math.round(sampleRate * hopSec))
        this.fftSize = nextPow2(this.hop)
        this.window = new Float32Array(this.hop).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.hop))
        const binHz = sampleRate / this.fftSize
        this.lo = Math.max(1, Math.ceil(voiceHz[0] / binHz))
        this.hi = Math.min(this.fftSize / 2, Math.floor(voiceHz[1] / binHz))
        this.buf = new Float32Array(this.hop)
    }

    get frames(): number { return this.loud.length }

    push(mono: Float32Array): void {
        let i = 0
        while (i < mono.length) {
            const take = Math.min(this.hop - this.fill, mono.length - i)
            this.buf.set(mono.subarray(i, i + take), this.fill)
            this.fill += take; i += take
            if (this.fill === this.hop) { this.frame(); this.fill = 0 }
        }
    }

    finish(): AudioFeatures {
        return { hopSec: this.hopSec, loudDb: Float32Array.from(this.loud), voiceDb: Float32Array.from(this.voice) }
    }

    private frame(): void {
        const x = new Float32Array(this.fftSize)
        for (let i = 0; i < this.hop; i++) x[i] = this.buf[i] * this.window[i]
        const p = powerSpectrum(x)
        let total = 0, band = 0
        for (let k = 0; k < p.length; k++) total += p[k]
        for (let k = this.lo; k <= this.hi; k++) band += p[k]
        this.loud.push(10 * Math.log10(total + 1e-12))
        this.voice.push(10 * Math.log10(band + 1e-12))
    }
}
