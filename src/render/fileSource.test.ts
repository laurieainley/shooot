import { describe, it, expect, vi } from 'vitest'
import { blockReader, exactReader, limiter } from './fileSource'

const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i % 256)
const blob = (n: number): Blob => new Blob([bytes(n) as BlobPart])

describe('blockReader', () => {
    it('should read a range inside one block', async () => {
        const read = blockReader(blob(100), 16)
        expect(await read(3, 9)).toEqual(bytes(100).slice(3, 9))
    })

    it('should read a range spanning several blocks', async () => {
        const read = blockReader(blob(100), 16)
        expect(await read(10, 50)).toEqual(bytes(100).slice(10, 50))
    })

    it('should read the short final block', async () => {
        const read = blockReader(blob(100), 16)
        expect(await read(90, 100)).toEqual(bytes(100).slice(90, 100))
    })

    it('should only slice whole aligned blocks and reuse cached ones', async () => {
        const b = blob(100)
        const slice = vi.spyOn(b, 'slice')
        const read = blockReader(b, 16)
        await read(10, 20)
        await read(12, 30)
        expect(slice.mock.calls).toEqual([[0, 16], [16, 32]])
    })

    it('should evict the least recently used block beyond the limit', async () => {
        const b = blob(100)
        const slice = vi.spyOn(b, 'slice')
        const read = blockReader(b, 16, 2)
        await read(0, 1)   // block 0
        await read(16, 17) // block 1
        await read(0, 1)   // block 0 is now most recent
        await read(32, 33) // block 2 evicts block 1
        await read(0, 1)   // still cached
        await read(16, 17) // re-read
        expect(slice.mock.calls).toEqual([[0, 16], [16, 32], [32, 48], [16, 32]])
    })

    it('should not cache a failed read', async () => {
        const b = blob(100)
        const slice = vi.spyOn(b, 'slice')
        slice.mockImplementationOnce(() => ({ arrayBuffer: () => Promise.reject(new Error('io')) }) as unknown as Blob)
        const read = blockReader(b, 16)
        await expect(read(0, 4)).rejects.toThrow('io')
        expect(await read(0, 4)).toEqual(bytes(4))
    })
})

/** A blob whose reads take `ms` and are counted, to see how many overlap. */
function slowBlob(n: number, ms: number): { blob: Blob; stats: { calls: number; peak: number; active: number } } {
    const stats = { calls: 0, peak: 0, active: 0 }
    const b = blob(n)
    vi.spyOn(b, 'slice').mockImplementation((s?: number, e?: number) => ({
        arrayBuffer: async () => {
            stats.calls++; stats.peak = Math.max(stats.peak, ++stats.active)
            await new Promise((r) => setTimeout(r, ms))
            stats.active--
            return (bytes(n).slice(s, e).buffer as ArrayBuffer)
        },
    }) as unknown as Blob)
    return { blob: b, stats }
}

describe('blockReader with small blocks and concurrency', () => {
    it('should read a range of many small blocks correctly with at most maxInFlight reads at once', async () => {
        const { blob: b, stats } = slowBlob(1000, 5)
        const read = blockReader(b, 10, 200, { maxInFlight: 4 })
        expect(await read(15, 905)).toEqual(bytes(1000).slice(15, 905))
        expect(stats.calls).toBe(90)
        expect(stats.peak).toBe(4)
    })

    it('should overlap the blocks of one range (faster than reading them one after another)', async () => {
        const { blob: b } = slowBlob(1000, 20)
        const read = blockReader(b, 100, 20, { maxInFlight: 5 })
        const t = performance.now()
        await read(0, 1000)
        expect(performance.now() - t).toBeLessThan(10 * 20 * 0.7)
    })

    it('should read one block at a time when limited to 1', async () => {
        const { blob: b, stats } = slowBlob(100, 1)
        await blockReader(b, 10, 20, { maxInFlight: 1 })(0, 100)
        expect(stats.peak).toBe(1)
    })
})

describe('limiter', () => {
    it('should run tasks in order with a cap and pass results and errors through', async () => {
        const run = limiter(2)
        let active = 0, peak = 0
        const task = (v: number) => run(async () => { peak = Math.max(peak, ++active); await new Promise((r) => setTimeout(r, 2)); active--; if (v === 3) throw new Error('x'); return v })
        const out = await Promise.allSettled([1, 2, 3, 4, 5].map(task))
        expect(peak).toBe(2)
        expect(out.map((o) => (o.status === 'fulfilled' ? o.value : 'err'))).toEqual([1, 2, 'err', 4, 5])
    })
})

describe('exactReader', () => {
    it('should read exactly the requested bytes', async () => {
        const b = blob(100)
        const slice = vi.spyOn(b, 'slice')
        expect(await exactReader(b, 2)(7, 19)).toEqual(bytes(100).slice(7, 19))
        expect(slice.mock.calls).toEqual([[7, 19]])
    })
})
