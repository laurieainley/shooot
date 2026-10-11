import * as ort from 'onnxruntime-web/webgpu'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { decodeBalls, looksLikeOnnx, toTensorData, TILE_SIZE } from './ballModel'
import type { Box } from '../utils/ballSampling'

export type BallWorkerIn = { type: 'init'; modelUrl: string; wasmOnly?: boolean } | { type: 'detect'; id: number; tiles: ImageData[] }
export type BallWorkerOut = { type: 'ready'; ep: string } | { type: 'progress'; loaded: number; total: number } | { type: 'result'; id: number; boxes: Box[][] } | { type: 'error'; id?: number; message: string }

// Self-hosted runtime (no CDN): ort 1.30's webgpu bundle loads the asyncify .wasm (emitted by Vite); the JS glue is inlined.
ort.env.wasm.wasmPaths = { wasm: wasmUrl }

let session: ort.InferenceSession | null = null
const post = (m: BallWorkerOut): void => (self as unknown as Worker).postMessage(m)

/** The response body, posting progress at each whole-percent change (total 0 when the size is unknown). */
async function readWithProgress(res: Response): Promise<Uint8Array> {
    const total = Number(res.headers.get('content-length')) || 0
    if (!res.body) return new Uint8Array(await res.arrayBuffer())
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0, lastPct = -1
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); loaded += value.length
        const pct = total > 0 ? Math.floor((loaded / total) * 100) : -1
        if (pct !== lastPct) { lastPct = pct; post({ type: 'progress', loaded, total }) }
    }
    const out = new Uint8Array(loaded)
    let at = 0
    for (const c of chunks) { out.set(c, at); at += c.length }
    return out
}

async function init(modelUrl: string, wasmOnly: boolean): Promise<void> {
    const res = await fetch(modelUrl)
    if (!res.ok) throw new Error('model not found')
    const buf = await readWithProgress(res)
    if (!looksLikeOnnx(buf, res.headers.get('content-type'))) throw new Error('model not found') // e.g. an SPA fallback page
    const options = { graphOptimizationLevel: 'all' as const }
    let ep = wasmOnly ? 'wasm' : 'webgpu'
    try {
        if (wasmOnly) throw new Error('wasm only')
        session = await ort.InferenceSession.create(buf, { ...options, executionProviders: ['webgpu', 'wasm'] })
    } catch {
        ep = 'wasm'
        session = await ort.InferenceSession.create(buf, { ...options, executionProviders: ['wasm'] })
    }
    post({ type: 'ready', ep })
}

async function detect(id: number, tiles: ImageData[]): Promise<void> {
    if (!session) throw new Error('Ball model not ready')
    const boxes: Box[][] = []
    for (const tile of tiles) {
        const out = await session.run({ input: new ort.Tensor('float32', toTensorData(tile), [1, 3, TILE_SIZE, TILE_SIZE]) })
        boxes.push(decodeBalls(out.dets.data as Float32Array, out.labels.data as Float32Array))
    }
    post({ type: 'result', id, boxes })
}

// Messages run strictly one at a time, in order: detect waits for init, and only one session.run is in flight.
// (Callers still await `ready` before detecting.) A failed detect rejects that request only; a failed init is fatal.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (e: MessageEvent<BallWorkerIn>): void => {
    const m = e.data
    queue = queue.then(async () => {
        try {
            if (m.type === 'init') await init(m.modelUrl, m.wasmOnly ?? false)
            else await detect(m.id, m.tiles)
        } catch (err) {
            post({ type: 'error', id: m.type === 'detect' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) })
        }
    })
}
