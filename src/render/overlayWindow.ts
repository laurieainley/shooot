/**
 * A GOP of a copied cut: its key packet's presentation time and the presentation time of its first frame
 * (earlier than `key` when the key has open-GOP leading pictures; equal for closed GOPs and the cut's first GOP,
 * whose leading pictures are dropped).
 */
export type Gop = { key: number; start: number }

/** One run of GOPs to decode, paint and re-encode. Indices refer to the cut's GOP list. */
export type ReencodeSpan = {
    /** GOP to start feeding the decoder from (one before `from` when `from` has leading pictures). */
    decodeFrom: number
    /** First GOP replaced: copied packets stop before this key (decode order). */
    from: number
    /** GOP whose key the copy resumes at (its leading pictures are re-encoded instead), or null = to the cut end. */
    resume: number | null
    /** Presentation range of the re-encoded frames. */
    outStart: number
    outEnd: number
    /** Overlay windows (clipped to the cut) that this span carries. */
    windows: [number, number][]
}

/** Which GOPs must be re-encoded to draw overlays over `windows` (source seconds) in a cut ending at `cutEnd`. */
export function overlaySpans(gops: Gop[], cutEnd: number, windows: [number, number][]): ReencodeSpan[] {
    if (gops.length === 0) return []
    const cutStart = gops[0].key
    const raw: { from: number; resume: number | null; windows: [number, number][] }[] = []
    for (const [a, b] of [...windows].sort((x, y) => x[0] - y[0])) {
        const w0 = Math.max(a, cutStart)
        const w1 = Math.min(b, cutEnd)
        if (w1 <= w0) continue
        let from = 0
        for (let i = 0; i < gops.length; i++) if (gops[i].start <= w0) from = i
        let resume: number | null = null
        for (let i = from + 1; i < gops.length; i++) if (gops[i].key >= w1) { resume = i; break }
        raw.push({ from, resume, windows: [[w0, w1]] })
    }
    const merged: typeof raw = []
    for (const r of raw) {
        const last = merged[merged.length - 1]
        if (last && (last.resume === null || r.from <= last.resume)) {
            last.resume = last.resume === null || r.resume === null ? null : Math.max(last.resume, r.resume)
            last.windows.push(...r.windows)
        } else merged.push(r)
    }
    return merged.map(({ from, resume, windows: w }) => ({
        decodeFrom: from > 0 && gops[from].start < gops[from].key ? from - 1 : from,
        from,
        resume,
        outStart: gops[from].start,
        outEnd: resume === null ? cutEnd : gops[resume].key,
        windows: w,
    }))
}
