/**
 * Stretches of a cut (by key-frame presentation times) that must be held in memory to draw overlays over `windows`:
 * from the key before the key at/before a window's start (a GOP with leading pictures is decoded from the previous
 * one) to the second key after the key at/before its end (the GOP the copy resumes at, leading pictures included).
 * Regions are [startKey, stopKey): buffering starts at the key `startKey` and the buffer is handed over when the key
 * `stopKey` is reached (Infinity = the end of the cut). Overlapping or touching regions merge. Everything outside
 * is streamed straight through, so a long cut with a few short overlays never sits in memory.
 */
export function overlayRegions(keyTimes: number[], windows: [number, number][]): [number, number][] {
    if (keyTimes.length === 0) return []
    const atOrBefore = (t: number): number => {
        let i = 0
        for (let j = 0; j < keyTimes.length; j++) if (keyTimes[j] <= t) i = j
        return i
    }
    const raw = windows
        .filter(([a, b]) => b > a)
        .map(([a, b]): [number, number] => {
            const from = Math.max(0, atOrBefore(a) - 1)
            const stop = atOrBefore(b) + 2
            return [keyTimes[from], stop < keyTimes.length ? keyTimes[stop] : Infinity]
        })
        .sort((x, y) => x[0] - y[0])
    const merged: [number, number][] = []
    for (const r of raw) {
        const last = merged[merged.length - 1]
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
        else merged.push([...r])
    }
    return merged
}
