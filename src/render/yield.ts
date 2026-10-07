// Waiting on the render path without timers: Chrome clamps setTimeout to >= 1 s in a hidden tab (and to once a minute
// after a few minutes), while MessageChannel messages and codec `dequeue` events keep their normal speed.

let channel: MessageChannel | null = null
const waiting: (() => void)[] = []

/** Lets the event loop run other tasks (a macrotask, like setTimeout 0) but is not throttled in a background tab. */
export function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return }
        if (!channel) {
            channel = new MessageChannel()
            channel.port1.onmessage = () => { waiting.shift()?.() }
            // Do not keep a node process alive.
            ;(channel.port1 as { unref?: () => void }).unref?.()
        }
        waiting.push(resolve)
        channel.port2.postMessage(null)
    })
}

/** The part of VideoEncoder / VideoDecoder / AudioEncoder / AudioDecoder that queue waiting uses. */
export type QueueCodec = EventTarget & { state: string } & ({ encodeQueueSize: number } | { decodeQueueSize: number })

const queued = (c: QueueCodec): number => ('encodeQueueSize' in c ? c.encodeQueueSize : c.decodeQueueSize)

/**
 * Resolves once the codec's queue holds at most `max` items, on each `dequeue` event. Also resolves when the codec is
 * closed or `signal` aborts (an error callback aborts it), so callers can then look at their failure.
 */
export function waitForQueue(codec: QueueCodec, max: number, signal?: AbortSignal): Promise<void> {
    const ready = (): boolean => queued(codec) <= max || codec.state === 'closed' || !!signal?.aborted
    if (ready()) return Promise.resolve()
    return new Promise((resolve) => {
        const check = (): void => {
            if (!ready()) return
            codec.removeEventListener('dequeue', check)
            signal?.removeEventListener('abort', check)
            resolve()
        }
        codec.addEventListener('dequeue', check)
        signal?.addEventListener('abort', check)
    })
}
