import { describe, expect, it, vi } from 'vitest'
import { createBallDetector } from './ballDetector'

function fake() {
    const w = { posted: [] as unknown[], terminated: false, onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null as ((e: { message: string }) => void) | null, onmessageerror: null as ((e: object) => void) | null,
        postMessage(m: unknown) { this.posted.push(m) }, terminate() { this.terminated = true },
        emit(data: unknown) { this.onmessage?.({ data }) } }
    return w
}
const tile = {} as ImageData
const box = { x1: 1, y1: 2, x2: 3, y2: 4, score: 0.9 }

describe('createBallDetector', () => {
    it('should init the worker with the model url and resolve ready with the provider', async () => {
        const w = fake(); const d = createBallDetector('/m.onnx', () => w as never)
        expect(w.posted[0]).toEqual({ type: 'init', modelUrl: '/m.onnx' })
        w.emit({ type: 'ready', ep: 'webgpu' })
        await expect(d.ready).resolves.toEqual({ ep: 'webgpu' })
    })
    it('should resolve detect with the boxes of the result', async () => {
        const w = fake(); const d = createBallDetector('/m', () => w as never)
        const p = d.detect([tile])
        expect(w.posted[1]).toEqual({ type: 'detect', tiles: [tile] })
        w.emit({ type: 'result', boxes: [[box]] })
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
