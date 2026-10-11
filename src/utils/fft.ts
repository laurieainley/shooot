/** Power spectrum |X[k]|² (k = 0…n/2) of a real frame by an iterative radix-2 FFT. `frame.length` must be a power of two. */
export function powerSpectrum(frame: Float32Array): Float32Array {
    const n = frame.length
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT length must be a power of two, got ${n}`)
    const re = Float64Array.from(frame), im = new Float64Array(n)
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = a + len / 2
                const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
                re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
            }
        }
    }
    const out = new Float32Array(n / 2 + 1)
    for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k]
    return out
}
