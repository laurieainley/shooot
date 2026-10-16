import { describe, expect, it } from 'vitest'
import { AHEAD_BUFFER_CAP_BYTES, LaneRestart, OrderedSink } from './orderedSink'
import type { LogRecord } from './packetLog'

const rec = (unit: number, n: number, bytes = 4): LogRecord => ({ track: 0, key: n === 0, timestamp: unit * 100 + n, duration: 1, data: new Uint8Array(bytes) })
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 1))

function setup(order: number[], cap?: number) {
    const out: number[] = []
    const sink = new OrderedSink(order, async (r) => { await tick(); out.push(r.timestamp) }, cap)
    return { out, sink }
}

describe('OrderedSink', () => {
    it('streams the head straight into the output', async () => {
        const { out, sink } = setup([1, 2])
        const a = sink.open(1)
        await a.write(rec(1, 0))
        expect(out).toEqual([100])
        expect(sink.bufferedBytes).toBe(0)
    })

    it('keeps a unit running ahead in memory and flushes it after the earlier unit', async () => {
        const { out, sink } = setup([1, 2, 3])
        const a = sink.open(1)
        const b = sink.open(2)
        await b.write(rec(2, 0))
        await b.write(rec(2, 1))
        expect(out).toEqual([])
        expect(sink.bufferedBytes).toBe(8)
        await a.write(rec(1, 0))
        await b.close() // unit 2 finished first
        expect(out).toEqual([100])
        await a.write(rec(1, 1))
        await a.close()
        expect(out).toEqual([100, 101, 200, 201])
        expect(sink.bufferedBytes).toBe(0)
        // unit 3 was not started: it is the head now and streams straight away
        const c = sink.open(3)
        await c.write(rec(3, 0))
        expect(out).toEqual([100, 101, 200, 201, 300])
    })

    it('hands the head to a unit that is still running and keeps its order', async () => {
        const { out, sink } = setup([1, 2])
        const a = sink.open(1)
        const b = sink.open(2)
        await b.write(rec(2, 0))
        await a.write(rec(1, 0))
        await a.close()
        expect(out).toEqual([100, 200]) // held packet first
        await b.write(rec(2, 1)) // then streams directly
        expect(out).toEqual([100, 200, 201])
        await b.close()
    })

    it('pauses a unit over the cap until it becomes the head', async () => {
        const { out, sink } = setup([1, 2], 10)
        const a = sink.open(1)
        const b = sink.open(2)
        await b.write(rec(2, 0, 6))
        let released = false
        const blocked = b.write(rec(2, 1, 6)).then(() => { released = true })
        await tick(); await tick()
        expect(released).toBe(false)
        await a.write(rec(1, 0))
        await tick()
        expect(released).toBe(false)
        await a.close()
        await blocked
        expect(released).toBe(true)
        expect(out).toEqual([100, 200, 201])
    })

    it('uses a named cap of 512 MB by default', () => {
        expect(AHEAD_BUFFER_CAP_BYTES).toBe(512 * 1024 * 1024)
    })

    it('abort (cancel) drops buffers and releases waiting units', async () => {
        const { out, sink } = setup([1, 2], 10)
        const a = sink.open(1)
        const b = sink.open(2)
        await a.write(rec(1, 0))
        const blocked = b.write(rec(2, 0, 20))
        const caught = blocked.catch((e: unknown) => e)
        await tick()
        expect(sink.bufferedBytes).toBe(20)
        const reason = new DOMException('Render cancelled', 'AbortError')
        sink.cancel(reason)
        expect(await caught).toBe(reason)
        expect(sink.bufferedBytes).toBe(0)
        await expect(a.write(rec(1, 1))).rejects.toBe(reason)
        expect(out).toEqual([100])
    })

    it('a failed ahead unit drops its buffer and can start again', async () => {
        const { out, sink } = setup([1, 2])
        const a = sink.open(1)
        const b = sink.open(2)
        await b.write(rec(2, 0))
        await b.abort(new Error('boom'))
        expect(sink.bufferedBytes).toBe(0)
        const b2 = sink.open(2)
        await b2.write(rec(2, 5))
        await a.close()
        await b2.close()
        expect(out).toEqual([205])
    })

    it('a failed head that already wrote cannot be redone, and units waiting on it restart', async () => {
        const { sink } = setup([1, 2], 10)
        const a = sink.open(1)
        const b = sink.open(2)
        await a.write(rec(1, 0))
        const blocked = b.write(rec(2, 0, 20)).catch((e: unknown) => e)
        await tick()
        const boom = new Error('boom')
        await a.abort(boom)
        expect(await blocked).toBeInstanceOf(LaneRestart)
        expect(() => sink.open(1)).toThrow(boom)
    })

    it('a unit over the cap while the head is not running restarts instead of waiting forever', async () => {
        const { sink } = setup([1, 2], 10)
        sink.open(1)
        const b = sink.open(2)
        await sink.open(1).abort(new Error('x')).catch(() => undefined)
        await expect(b.write(rec(2, 0, 20))).rejects.toBeInstanceOf(LaneRestart)
    })
})
