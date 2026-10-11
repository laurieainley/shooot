export type ByteRange = { start: number; end: number }
export type RangeReader = (start: number, end: number) => Promise<Uint8Array>

/**
 * Turns the byte ranges a reader asked for into a short list of reads: sorted, overlapping or nearby ranges
 * (gap <= `maxGap`) merged, no merged read longer than `maxLen` (a single bigger range stays whole).
 */
export function coalesceRanges(ranges: readonly ByteRange[], maxGap: number, maxLen: number): ByteRange[] {
    const sorted = ranges.filter((r) => r.end > r.start).map((r) => ({ ...r })).sort((a, b) => a.start - b.start || a.end - b.end)
    const out: ByteRange[] = []
    for (const r of sorted) {
        const last = out[out.length - 1]
        if (last && r.start - last.end <= maxGap && Math.max(last.end, r.end) - last.start <= maxLen) last.end = Math.max(last.end, r.end)
        else out.push(r)
    }
    return out
}

/**
 * A reader that already knows which reads are coming (`plan`, sorted and non-overlapping): when a read lands in
 * planned read `i` it starts planned reads `i .. i + ahead` (through `fetch`, which bounds how many run at once),
 * so the per-read latency of slow storage overlaps instead of adding up. Planned reads behind the current one are
 * dropped. Reads outside the plan, or that no longer match it, go to `fallback`.
 */
export function plannedReader(plan: readonly ByteRange[], fetch: RangeReader, fallback: RangeReader, ahead: number): RangeReader {
    const pending = new Map<number, Promise<Uint8Array>>()
    const indexOf = (start: number, end: number): number => {
        let lo = 0, hi = plan.length - 1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (plan[mid].end <= start) lo = mid + 1
            else if (plan[mid].start > start) hi = mid - 1
            else return end <= plan[mid].end ? mid : -1
        }
        return -1
    }
    const request = (i: number): Promise<Uint8Array> => {
        let p = pending.get(i)
        if (!p) {
            p = fetch(plan[i].start, plan[i].end)
            p.catch(() => { if (pending.get(i) === p) pending.delete(i) })
            pending.set(i, p)
        }
        return p
    }
    return async (start, end) => {
        const i = indexOf(start, end)
        if (i < 0) return fallback(start, end)
        for (const k of [...pending.keys()]) if (k < i) pending.delete(k)
        for (let k = i + 1; k <= Math.min(plan.length - 1, i + ahead); k++) void request(k).catch(() => {})
        const seg = await request(i)
        if (seg.length !== plan[i].end - plan[i].start) return fallback(start, end)
        return seg.subarray(start - plan[i].start, end - plan[i].start)
    }
}
