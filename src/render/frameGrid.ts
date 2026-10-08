const RATES = [24000 / 1001, 24, 25, 30000 / 1001, 30, 48, 50, 60000 / 1001, 60, 100, 120000 / 1001, 120, 240000 / 1001, 240]

/** Frame duration for a measured packet rate, snapped to a standard rate (e.g. 29.97 → 1001/30000 s). */
export function frameDuration(rate: number): number {
    if (!Number.isFinite(rate) || rate <= 0) return 1001 / 30000
    // A variable-frame-rate average can be anything; cards still need a rate encoders accept.
    rate = Math.min(240, Math.max(5, rate))
    // The closest standard rate (30 and 29.97 are 0.1% apart: the first one within tolerance would be wrong for exact 30).
    const near = RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), RATES[0])
    if (Math.abs(near - rate) / near >= 0.002) return 1 / rate
    const ntsc = [24000, 30000, 60000, 120000, 240000].find((n) => Math.abs(n / 1001 - near) < 1e-9)
    return ntsc ? 1001 / ntsc : 1 / near
}

/** Position of each timestamp (given in decode order) in presentation order. */
export function presentationRanks(timestamps: number[]): number[] {
    const order = timestamps.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0])
    const ranks = new Array<number>(timestamps.length)
    order.forEach(([, i], rank) => { ranks[i] = rank })
    return ranks
}

/**
 * The footage's usual frame rate from a sample of presentation timestamps: the median gap, so a variable-frame-rate
 * phone clip that mostly runs at 30 fps but drops frames in the dark still reads 30 (its average would not).
 * Returns 0 when there is nothing to measure.
 */
export function nominalFrameRate(timestamps: number[]): number {
    const sorted = [...timestamps].sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
        const d = sorted[i] - sorted[i - 1]
        if (d > 1e-6) gaps.push(d)
    }
    if (gaps.length === 0) return 0
    gaps.sort((a, b) => a - b)
    const mid = gaps.length >> 1
    const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
    return 1 / median
}
