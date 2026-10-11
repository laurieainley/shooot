import { describe, expect, it, vi } from 'vitest'
import { createBallDetector } from './ballDetector'

function fake() {
    const w = { posted: [] as unknown[], terminated: false, onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null as ((e: { message: string }) => void) | null, onmessageerror: null as ((e: object) => void) | null,
        postMessage(m: unknown) { this.posted.push(m) }, terminate() { this.terminated = true },
        emit(data: unknown) { this.onmessage?.({ data }) } }
    return w
}
const tile = { data: { buffer: new ArrayBuffer(1) } } as unknown as ImageData
const box = { x1: 1, y1: 2, x2: 3, y2: 4, score: 0.9 }

describe('createBallDetector', () => {
    it('should report the model download as a fraction, ignoring unknown totals', () => {
        const w = fake(); const seen: number[] = []
        createBallDetector('/m', () => w as never, (f) => seen.push(f))
        w.emit({ type: 'progress', loaded: 10, total: 40 }); w.emit({ type: 'progress', loaded: 40, total: 40 }); w.emit({ type: 'progress', loaded: 5, total: 0 })
        expect(seen).toEqual([0.25, 1])
    })
    it('should init the worker with the model url and resolve ready with the provider', async () => {
        const w = fake(); const d = createBallDetector('/m.onnx', () => w as never)
        expect(w.posted[0]).toMatchObject({ type: 'init', modelUrl: '/m.onnx' })
        w.emit({ type: 'ready', ep: 'webgpu' })
        await expect(d.ready).resolves.toEqual({ ep: 'webgpu' })
    })
    it('should resolve detect with the boxes of the result', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const p = d.detect([tile])
        expect(w.posted[1]).toEqual({ type: 'detect', id: 0, tiles: [tile] })
        w.emit({ type: 'result', id: 0, boxes: [[box]] })
        await expect(p).resolves.toEqual([[box]])
    })
    it('should reject ready and detect on a worker error message', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const p = d.detect([tile])
        w.emit({ type: 'error', message: 'model not found' })
        await expect(p).rejects.toThrow('model not found')
        await expect(d.ready).rejects.toThrow('model not found')
        await expect(d.detect([tile])).rejects.toThrow('model not found')
    })
    it('should match concurrent calls to their replies by id', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const a = d.detect([tile]), b = d.detect([tile])
        w.emit({ type: 'result', id: 1, boxes: [[box]] }); w.emit({ type: 'result', id: 0, boxes: [] })
        await expect(b).resolves.toEqual([[box]]); await expect(a).resolves.toEqual([])
    })
    it('should ignore a stale result after abort and give a new call its own', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const ac = new AbortController(); const a = d.detect([tile], ac.signal); ac.abort()
        await expect(a).rejects.toThrow('Cancelled')
        const b = d.detect([tile])
        w.emit({ type: 'result', id: 0, boxes: [[box]] }) // stale
        w.emit({ type: 'result', id: 1, boxes: [] })
        await expect(b).resolves.toEqual([])
    })
    it('should reject only the failing call on an id-tagged error and stay usable', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const a = d.detect([tile]); w.emit({ type: 'error', id: 0, message: 'bad tile' })
        await expect(a).rejects.toThrow('bad tile')
        const b = d.detect([tile]); w.emit({ type: 'result', id: 1, boxes: [] })
        await expect(b).resolves.toEqual([])
    })
    it('should reject on onerror and onmessageerror', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const p = d.detect([tile]); w.onerror?.({ message: 'boom' })
        await expect(p).rejects.toThrow('boom')
        const w2 = fake(); const d2 = createBallDetector('/m', () => w2 as never)
        const p2 = d2.detect([tile]); w2.onmessageerror?.({})
        await expect(p2).rejects.toThrow('Ball check failed')
    })
    it('should reject promptly on abort and when already aborted', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const ac = new AbortController(); const p = d.detect([tile], ac.signal)
        ac.abort()
        await expect(p).rejects.toThrow('Cancelled')
        await expect(d.detect([tile], ac.signal)).rejects.toThrow('Cancelled')
    })
    it('should terminate the worker and reject pending work on dispose', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const p = d.detect([tile]); const t = vi.fn(); w.terminate = t
        d.dispose()
        await expect(p).rejects.toThrow('Cancelled')
        expect(t).toHaveBeenCalled()
    })
})
