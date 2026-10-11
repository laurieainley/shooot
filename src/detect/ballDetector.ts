import type { Box } from '../utils/ballSampling'
import type { BallWorkerIn, BallWorkerOut } from './ballDetector.worker'

export type BallDetector = {
    ready: Promise<{ ep: string }>
    detect: (tiles: ImageData[], signal?: AbortSignal) => Promise<Box[][]>
    dispose: () => void
}

type WorkerLike = {
    postMessage: (m: BallWorkerIn, transfer?: Transferable[]) => void
    terminate: () => void
    onmessage: ((e: MessageEvent<BallWorkerOut>) => void) | null
    onerror: ((e: ErrorEvent) => void) | null
    onmessageerror: ((e: MessageEvent) => void) | null
}

const defaultFactory = (): WorkerLike => new Worker(new URL('./ballDetector.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike

/** The ball model in a Web Worker (WebGPU, else WASM). One request at a time; the model file is fetched by the worker. */
export function createBallDetector(
    modelUrl: string = import.meta.env.VITE_BALL_MODEL_URL ?? '/models/rfdetr-nano-fp16.onnx',
    makeWorker: () => WorkerLike = defaultFactory,
): BallDetector {
    const worker = makeWorker()
    let failure: Error | null = null
    let resolveReady!: (v: { ep: string }) => void
    let rejectReady!: (e: Error) => void
    const ready = new Promise<{ ep: string }>((res, rej) => { resolveReady = res; rejectReady = rej })
    ready.catch(() => undefined)
    let nextId = 0
    const pending = new Map<number, { resolve: (b: Box[][]) => void; reject: (e: Error) => void }>()
    const fail = (e: Error): void => { failure ??= e; rejectReady(e); const all = [...pending.values()]; pending.clear(); all.forEach((p) => p.reject(e)) }
    worker.onerror = (e) => fail(new Error(e.message || 'Ball check failed'))
    worker.onmessageerror = () => fail(new Error('Ball check failed'))
    worker.onmessage = (e) => {
        const m = e.data
        if (m.type === 'ready') resolveReady({ ep: m.ep })
        else if (m.type === 'result') { const p = pending.get(m.id); pending.delete(m.id); p?.resolve(m.boxes) } // stale (aborted) ids are ignored
        else if (m.id !== undefined) { const p = pending.get(m.id); pending.delete(m.id); p?.reject(new Error(m.message)) } // that request only
        else fail(new Error(m.message))
    }
    worker.postMessage({ type: 'init', modelUrl, wasmOnly: import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('ballEp') === 'wasm' })
    return {
        ready,
        // Await `ready` first. Several calls may be in flight: the worker runs them in order and replies carry the request id.
        detect: (tiles, signal) => new Promise<Box[][]>((resolve, reject) => {
            if (failure) { reject(failure); return }
            if (signal?.aborted) { reject(new Error('Cancelled')); return }
            const id = nextId++
            const onAbort = (): void => { pending.delete(id); reject(new Error('Cancelled')) }
            signal?.addEventListener('abort', onAbort, { once: true })
            pending.set(id, {
                resolve: (b) => { signal?.removeEventListener('abort', onAbort); resolve(b) },
                reject: (e) => { signal?.removeEventListener('abort', onAbort); reject(e) },
            })
            worker.postMessage({ type: 'detect', id, tiles }, tiles.map((t) => t.data.buffer))
        }),
        dispose: () => { fail(new Error('Cancelled')); worker.terminate() },
    }
}
