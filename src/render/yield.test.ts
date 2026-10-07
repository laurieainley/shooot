import { describe, it, expect, vi } from 'vitest'
import { yieldToEventLoop, waitForQueue, type QueueCodec } from './yield'

describe('yieldToEventLoop', () => {
    it('should resolve without using timers', async () => {
        vi.useFakeTimers()
        try {
            await yieldToEventLoop()
        } finally {
            vi.useRealTimers()
        }
    })
    it('should let queued macrotasks run first', async () => {
        const order: string[] = []
        setTimeout(() => order.push('timer'), 0)
        await yieldToEventLoop()
        order.push('yield')
        expect(order[order.length - 1]).toBe('yield')
    })
})

class FakeCodec extends EventTarget {
    state: 'configured' | 'closed' = 'configured'
    encodeQueueSize = 0
    drain(to: number): void { this.encodeQueueSize = to; this.dispatchEvent(new Event('dequeue')) }
}

describe('waitForQueue', () => {
    it('should resolve at once when the queue is short', async () => {
        const c = new FakeCodec()
        c.encodeQueueSize = 4
        await waitForQueue(c, 4)
    })
    it('should wait for dequeue events until the queue drops to the limit', async () => {
        const c = new FakeCodec()
        c.encodeQueueSize = 9
        let done = false
        const p = waitForQueue(c, 4).then(() => { done = true })
        await yieldToEventLoop()
        expect(done).toBe(false)
        c.drain(6)
        await yieldToEventLoop()
        expect(done).toBe(false)
        c.drain(4)
        await p
        expect(done).toBe(true)
    })
    it('should read decodeQueueSize for decoders', async () => {
        const c = new EventTarget() as EventTarget & { state: string; decodeQueueSize: number }
        c.state = 'configured'; c.decodeQueueSize = 7
        const p = waitForQueue(c as unknown as QueueCodec, 4)
        c.decodeQueueSize = 2
        c.dispatchEvent(new Event('dequeue'))
        await p
    })
    it('should resolve when the codec is closed', async () => {
        const c = new FakeCodec()
        c.encodeQueueSize = 9
        const p = waitForQueue(c, 4)
        c.state = 'closed'
        c.dispatchEvent(new Event('dequeue'))
        await p
    })
    it('should resolve when aborted by an error', async () => {
        const c = new FakeCodec()
        c.encodeQueueSize = 9
        const ac = new AbortController()
        const p = waitForQueue(c, 4, ac.signal)
        ac.abort()
        await p
    })
    it('should not leave listeners behind', async () => {
        const c = new FakeCodec()
        c.encodeQueueSize = 9
        const spy = vi.spyOn(c, 'removeEventListener')
        const p = waitForQueue(c, 4)
        c.drain(0)
        await p
        expect(spy).toHaveBeenCalled()
    })
})
