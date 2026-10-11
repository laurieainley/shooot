import { CustomSource, type Source } from 'mediabunny'

// On Android, every File.slice read from USB storage costs ~0.25 s regardless of
// size, so read few, large, aligned blocks and keep the most recent ones in memory.
export const BLOCK_SIZE = 8 * 1024 * 1024
const MAX_BLOCKS = 6

export type ByteRangeReader = (start: number, end: number) => Promise<Uint8Array>

/** Runs async tasks with at most `max` in flight at once (unbounded when `max` is Infinity). */
export function limiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
    let active = 0
    const waiting: (() => void)[] = []
    const release = (): void => { active--; waiting.shift()?.() }
    return async (task) => {
        if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve))
        active++
        try { return await task() } finally { release() }
    }
}

export type BlockReaderOptions = {
    /** Most file reads in flight at once (default: no limit). Rendering reads one block at a time; the audio pass overlaps several. */
    maxInFlight?: number
}

export function blockReader(file: Blob, blockSize = BLOCK_SIZE, maxBlocks = MAX_BLOCKS, options: BlockReaderOptions = {}): ByteRangeReader {
    const run = limiter(options.maxInFlight ?? Infinity)
    const cache = new Map<number, Promise<Uint8Array>>()

    const block = (i: number): Promise<Uint8Array> => {
        const hit = cache.get(i)
        if (hit) {
            // Re-insert so Map order tracks recency (oldest first).
            cache.delete(i)
            cache.set(i, hit)
            return hit
        }
        const p = run(() => file.slice(i * blockSize, Math.min(file.size, (i + 1) * blockSize)).arrayBuffer())
            .then((b) => new Uint8Array(b))
        p.catch(() => {
            if (cache.get(i) === p) cache.delete(i)
        })
        cache.set(i, p)
        while (cache.size > maxBlocks) cache.delete(cache.keys().next().value!)
        return p
    }

    return async (start, end) => {
        const first = Math.floor(start / blockSize)
        const last = Math.floor((end - 1) / blockSize)
        const out = new Uint8Array(end - start)
        // Start every block of the range before waiting, so several reads overlap (bounded by maxInFlight).
        const blocks: Promise<Uint8Array>[] = []
        for (let i = first; i <= last; i++) blocks.push(block(i))
        for (let i = first; i <= last; i++) {
            const b = await blocks[i - first]
            const bStart = i * blockSize
            const from = Math.max(start, bStart) - bStart
            const to = Math.min(end, bStart + b.length) - bStart
            out.set(b.subarray(from, to), bStart + from - start)
        }
        return out
    }
}

/** Reads exactly the requested bytes (no block rounding, no cache) with at most `maxInFlight` reads at once. */
export function exactReader(file: Blob, maxInFlight: number): ByteRangeReader {
    const run = limiter(maxInFlight)
    return (start, end) => run(async () => new Uint8Array(await file.slice(start, end).arrayBuffer()))
}

export function fileSource(file: File): Source {
    return new CustomSource({
        getSize: () => file.size,
        read: blockReader(file),
        maxCacheSize: 16 * 1024 * 1024,
    })
}
