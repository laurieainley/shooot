const RATES = [24000 / 1001, 24, 25, 30000 / 1001, 30, 48, 50, 60000 / 1001, 60, 100, 120000 / 1001, 120, 240000 / 1001, 240]

/** Frame duration for a measured packet rate, snapped to a standard rate (e.g. 29.97 → 1001/30000 s). */
export function frameDuration(rate: number): number {
    if (!Number.isFinite(rate) || rate <= 0) return 1001 / 30000
    const near = RATES.find((r) => Math.abs(r - rate) / r < 0.002)
    if (near === undefined) return 1 / rate
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
