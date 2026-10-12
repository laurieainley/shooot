import { describe, expect, it } from 'vitest'
import type { VideoSample } from 'mediabunny'
import { readAhead } from './transcodeEngine'

type Fake = { id: number; closed: boolean; close: () => void }
const make = (n: number): { items: Fake[]; iterator: AsyncIterator<VideoSample>; pulled: () => number } => {
    const items: Fake[] = Array.from({ length: n }, (_, id) => { const f: Fake = { id, closed: false, close: () => { f.closed = true } }; return f })
    let i = 0
    const iterator = {
        async next() { await Promise.resolve(); return i < items.length ? { done: false as const, value: items[i++] as unknown as VideoSample } : { done: true as const, value: undefined } },
        async return() { return { done: true as const, value: undefined } },
    }
    return { items, iterator, pulled: () => i }
}

describe('readAhead (bench experiment 9)', () => {
    it('should hand over every sample in order and then finish', async () => {
        const { iterator } = make(7)
        const it = readAhead(iterator, 3)
        const ids: number[] = []
        for (;;) { const r = await it.next(); if (r.done) break; ids.push((r.value as unknown as Fake).id) }
        expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6])
    })
    it('should read ahead by at most the depth', async () => {
        const { iterator, pulled } = make(50)
        const it = readAhead(iterator, 4)
        await it.next()
        for (let k = 0; k < 20; k++) await Promise.resolve()
        expect(pulled()).toBeLessThanOrEqual(1 + 4 + 1)
        expect(pulled()).toBeGreaterThan(1)
        await it.return?.(undefined)
    })
    it('should close the samples it read but nobody took when it is returned early', async () => {
        const { items, iterator } = make(10)
        const it = readAhead(iterator, 3)
        await it.next()
        for (let k = 0; k < 20; k++) await Promise.resolve()
        await it.return?.(undefined)
        const taken = 1
        const waiting = items.slice(taken).filter((f) => f.closed)
        expect(waiting.length).toBeGreaterThan(0)
        expect(items[0].closed).toBe(false)
    })
})
