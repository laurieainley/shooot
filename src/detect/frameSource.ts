import type { Frame, GoalTile } from '../utils/ballSampling'
import type { FrameWorkerIn, FrameWorkerOut } from './frameSource.worker'

export type FrameSource = {
    frameSize: Frame
    /** For each time, the decoded frame's tile regions as 384×384 images (one per tile, same order). */
    tilesAt: (timesSec: number[], tiles: GoalTile[], signal?: AbortSignal) => AsyncGenerator<{ timeSec: number; images: ImageData[] }>
    dispose: () => void
}

/** Frames the decoder may run ahead of the ball model. */
const AHEAD = 2

type Waiter = { frame: (f: { timeSec: number; images: ImageData[] }) => void; done: () => void; fail: (e: Error) => void }

/**
 * Decoded video frames of one file for the ball check. Mediabunny decoding, the canvas draw and the tile read-back all run in a
 * Web Worker (4K HEVC on the main thread froze the page and the playing video); only the small tile images come back.
 * Engine boundary: verified with real renders, no unit test.
 */
export function createFrameSource(file: File): Promise<FrameSource> {
    const worker = new Worker(new URL('./frameSource.worker.ts', import.meta.url), { type: 'module' })
    const send = (m: FrameWorkerIn): void => worker.postMessage(m)
    const waiters = new Map<number, Waiter>()
    let nextId = 0
    let failure: Error | null = null
    return new Promise<FrameSource>((resolve, reject) => {
        const fail = (e: Error): void => { failure ??= e; reject(e); const all = [...waiters.values()]; waiters.clear(); all.forEach((w) => w.fail(e)) }
        worker.onerror = (e) => fail(new Error(e.message || 'Decoding failed'))
        worker.onmessageerror = () => fail(new Error('Decoding failed'))
        worker.onmessage = (e: MessageEvent<FrameWorkerOut>) => {
            const m = e.data
            if (m.type === 'opened') {
                resolve({
                    frameSize: m.frameSize,
                    async *tilesAt(timesSec, tiles, signal) {
                        if (failure) throw failure
                        const id = nextId++
                        const queue: { timeSec: number; images: ImageData[] }[] = []
                        let finished = false
                        let error: Error | null = null
                        let wake: (() => void) | null = null
                        const poke = (): void => { const w = wake; wake = null; w?.() }
                        waiters.set(id, { frame: (f) => { queue.push(f); poke() }, done: () => { finished = true; poke() }, fail: (er) => { error = er; poke() } })
                        const onAbort = (): void => { error = new Error('Cancelled'); poke() }
                        signal?.addEventListener('abort', onAbort, { once: true })
                        send({ type: 'tiles', id, times: timesSec, tiles, ahead: AHEAD })
                        try {
                            for (;;) {
                                if (signal?.aborted) throw new Error('Cancelled')
                                const f = queue.shift()
                                if (f) { send({ type: 'pull', id }); yield f; continue }
                                if (error) throw error
                                if (finished) return
                                await new Promise<void>((r) => { wake = r })
                            }
                        } finally {
                            signal?.removeEventListener('abort', onAbort)
                            waiters.delete(id)
                            send({ type: 'stop', id })
                        }
                    },
                    dispose: () => { fail(new Error('Cancelled')); worker.terminate() },
                })
            } else if (m.type === 'frame') waiters.get(m.id)?.frame({ timeSec: m.timeSec, images: m.images })
            else if (m.type === 'done') waiters.get(m.id)?.done()
            else if (m.id !== undefined) { const w = waiters.get(m.id); waiters.delete(m.id); w?.fail(new Error(m.message)) }
            else fail(new Error(m.message))
        }
        send({ type: 'open', file })
    }).catch((e) => { worker.terminate(); throw e })
}
