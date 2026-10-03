import { describe, it, expect, vi } from 'vitest'
import { blockReader } from './fileSource'

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
