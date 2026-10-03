import { CustomSource, type Source } from 'mediabunny'

// On Android, every File.slice read from USB storage costs ~0.25 s regardless of
// size, so read few, large, aligned blocks and keep the most recent ones in memory.
export const BLOCK_SIZE = 8 * 1024 * 1024
const MAX_BLOCKS = 6

export type ByteRangeReader = (start: number, end: number) => Promise<Uint8Array>

export function blockReader(file: Blob, blockSize = BLOCK_SIZE, maxBlocks = MAX_BLOCKS): ByteRangeReader {
    const cache = new Map<number, Promise<Uint8Array>>()

    const block = (i: number): Promise<Uint8Array> => {
        const hit = cache.get(i)
        if (hit) {
            // Re-insert so Map order tracks recency (oldest first).
            cache.delete(i)
            cache.set(i, hit)
            return hit
        }
        const p = file
            .slice(i * blockSize, Math.min(file.size, (i + 1) * blockSize))
            .arrayBuffer()
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
        for (let i = first; i <= last; i++) {
            const b = await block(i)
            const bStart = i * blockSize
            const from = Math.max(start, bStart) - bStart
            const to = Math.min(end, bStart + b.length) - bStart
            out.set(b.subarray(from, to), bStart + from - start)
        }
        return out
    }
}

export function fileSource(file: File): Source {
    return new CustomSource({
        getSize: () => file.size,
        read: blockReader(file),
        maxCacheSize: 16 * 1024 * 1024,
    })
}
