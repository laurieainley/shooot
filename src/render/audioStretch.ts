// WSOLA (waveform-similarity overlap-add) time stretch: slows audio down without lowering its pitch.
// Output frames are Hann-windowed input frames laid down every HOP samples; each next input frame is
// taken near its nominal position (advancing HOP × speed) at the offset whose waveform best continues
// the previous frame, so the overlaps add up in phase instead of beating.

const FRAME = 1024          // ≈ 21 ms at 48 kHz
const HOP = FRAME / 2       // synthesis hop (50 % overlap; periodic Hann windows sum to 1)
const TOLERANCE = 256       // search ± this many samples around the nominal position

let hann: Float32Array | null = null
function window(): Float32Array {
    if (!hann) {
        hann = new Float32Array(FRAME)
        for (let i = 0; i < FRAME; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME)
    }
    return hann
}

function mixDown(samples: Float32Array, channels: number, frames: number): Float32Array {
    if (channels === 1) return samples
    const mono = new Float32Array(frames)
    for (let i = 0; i < frames; i++) {
        let sum = 0
        for (let c = 0; c < channels; c++) sum += samples[i * channels + c]
        mono[i] = sum / channels
    }
    return mono
}

function correlation(x: Float32Array, a: number, b: number, length: number, step: number): number {
    let sum = 0
    for (let i = 0; i < length; i += step) sum += x[a + i] * x[b + i]
    return sum
}

/** Input offset near `nominal` whose frame best continues the frame starting at `natural`. */
function bestOffset(mono: Float32Array, natural: number, nominal: number, maxStart: number): number {
    const lo = Math.max(0, nominal - TOLERANCE)
    const hi = Math.min(maxStart, nominal + TOLERANCE)
    if (hi <= lo) return Math.max(0, Math.min(maxStart, nominal))
    const length = Math.min(FRAME, mono.length - natural, mono.length - hi)
    if (length <= 0) return Math.max(lo, Math.min(hi, nominal))
    // Coarse search on every 4th sample, then refine around the winner at full resolution.
    let best = lo
    let bestScore = -Infinity
    for (let p = lo; p <= hi; p += 4) {
        const score = correlation(mono, natural, p, length, 4)
        if (score > bestScore) { bestScore = score; best = p }
    }
    const coarse = best
    bestScore = -Infinity
    for (let p = Math.max(lo, coarse - 3); p <= Math.min(hi, coarse + 3); p++) {
        const score = correlation(mono, natural, p, length, 1)
        if (score > bestScore) { bestScore = score; best = p }
    }
    return best
}

/**
 * Time-stretch interleaved samples by `factor` (the playback speed: 0.5 makes it twice as long) keeping the pitch.
 * Returns interleaved samples, `round(frames / factor)` frames long.
 */
export function timeStretch(samples: Float32Array, channels: number, factor: number): Float32Array {
    const inFrames = Math.floor(samples.length / channels)
    if (factor === 1) return samples.slice(0, inFrames * channels)
    const outFrames = Math.round(inFrames / factor)
    const out = new Float32Array(outFrames * channels)
    if (inFrames === 0 || outFrames === 0) return out

    const win = window()
    const weight = new Float32Array(outFrames)
    const mono = mixDown(samples, channels, inFrames)
    const maxStart = Math.max(0, inFrames - FRAME)
    const analysisHop = HOP * factor
    let previous = 0

    for (let k = 0, outPos = 0; outPos < outFrames; k++, outPos += HOP) {
        const nominal = Math.round(k * analysisHop)
        const pos = k === 0 ? 0 : bestOffset(mono, Math.min(previous + HOP, maxStart), nominal, maxStart)
        for (let i = 0; i < FRAME; i++) {
            const o = outPos + i
            const src = pos + i
            if (o >= outFrames || src >= inFrames) break
            const w = win[i]
            for (let c = 0; c < channels; c++) out[o * channels + c] += samples[src * channels + c] * w
            weight[o] += w
        }
        previous = pos
    }
    // Normalise by the summed windows (1 in the steady state; less at the edges).
    for (let o = 0; o < outFrames; o++) {
        const w = weight[o]
        if (w > 1e-3) for (let c = 0; c < channels; c++) out[o * channels + c] /= w
    }
    return out
}
