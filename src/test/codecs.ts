const NAMES = ['VideoEncoder', 'VideoDecoder', 'VideoFrame', 'AudioEncoder', 'AudioDecoder', 'OffscreenCanvas'] as const
type G = Record<string, unknown>

/** Test helper: pretend this browser has WebCodecs (graphics available). Returns a function that undoes it. */
export function stubWebCodecs(present = true): () => void {
    const g = globalThis as unknown as G
    const saved = NAMES.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)] as const)
    for (const n of NAMES) {
        if (present) Object.defineProperty(globalThis, n, { value: class {}, configurable: true, writable: true })
        else delete g[n]
    }
    return () => {
        for (const [n, d] of saved) { if (d) Object.defineProperty(globalThis, n, d); else delete g[n] }
    }
}
