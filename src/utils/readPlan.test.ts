import { describe, expect, it } from 'vitest'
import { coalesceRanges, plannedReader, type RangeReader } from './readPlan'

const data = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i % 251)

describe('coalesceRanges', () => {
    it('should sort, merge near ranges and keep far ones apart', () => {
        expect(coalesceRanges([{ start: 500, end: 600 }, { start: 0, end: 100 }, { start: 150, end: 200 }], 100, 10_000))
            .toEqual([{ start: 0, end: 200 }, { start: 500, end: 600 }])
    })
    it('should merge overlapping and contained ranges', () => {
        expect(coalesceRanges([{ start: 0, end: 100 }, { start: 20, end: 30 }, { start: 90, end: 120 }], 0, 10_000)).toEqual([{ start: 0, end: 120 }])
    })
    it('should not grow a merged read beyond maxLen, and drops empty ranges', () => {
        expect(coalesceRanges([{ start: 0, end: 60 }, { start: 60, end: 120 }, { start: 130, end: 130 }], 10, 100)).toEqual([{ start: 0, end: 60 }, { start: 60, end: 120 }])
    })
})

describe('plannedReader', () => {
    const setup = (plan: { start: number; end: number }[], ms = 5) => {
        const log = { fetches: [] as number[], fallbacks: 0, active: 0, peak: 0 }
        const src = data(10_000)
        const fetch: RangeReader = async (s, e) => {
            log.fetches.push(s); log.peak = Math.max(log.peak, ++log.active)
            await new Promise((r) => setTimeout(r, ms)); log.active--
            return src.slice(s, e)
        }
        const fallback: RangeReader = async (s, e) => { log.fallbacks++; return src.slice(s, e) }
        return { log, src, fetch, fallback, plan }
    }
    const plan = [0, 1, 2, 3, 4, 5].map((i) => ({ start: i * 1000, end: i * 1000 + 100 }))

    it('should return the bytes for reads inside planned ranges', async () => {
        const t = setup(plan)
        const read = plannedReader(t.plan, t.fetch, t.fallback, 2)
        expect(await read(1010, 1040)).toEqual(t.src.slice(1010, 1040))
        expect(t.log.fallbacks).toBe(0)
    })

    it('should start the next planned reads ahead, once each, and overlap them', async () => {
        const t = setup(plan, 20)
        const read = plannedReader(t.plan, t.fetch, t.fallback, 3)
        const start = performance.now()
        for (const p of plan) await read(p.start, p.end)
        expect(t.log.fetches.sort((a, b) => a - b)).toEqual([0, 1000, 2000, 3000, 4000, 5000])
        expect(t.log.peak).toBeGreaterThan(1)
        expect(performance.now() - start).toBeLessThan(6 * 20 * 0.8)
    })

    it('should use the fallback for reads outside the plan or spanning past it', async () => {
        const t = setup(plan)
        const read = plannedReader(t.plan, t.fetch, t.fallback, 1)
        expect(await read(500, 520)).toEqual(t.src.slice(500, 520))
        expect(await read(50, 150)).toEqual(t.src.slice(50, 150))
        expect(t.log.fallbacks).toBe(2)
    })

    it('should fall back when a planned read fails', async () => {
        const t = setup(plan)
        let first = true
        const fetch: RangeReader = async (s, e) => { if (first) { first = false; throw new Error('io') } return t.fetch(s, e) }
        const read = plannedReader(t.plan, fetch, t.fallback, 0)
        await expect(read(0, 10)).rejects.toThrow('io')
        expect(await read(0, 10)).toEqual(t.src.slice(0, 10))
    })
})
