import * as ort from 'onnxruntime-web/webgpu'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url'
import { decodeBalls, toTensorData, TILE_SIZE } from './ballModel'
import type { Box } from '../utils/ballSampling'

export type BallWorkerIn = { type: 'init'; modelUrl: string } | { type: 'detect'; tiles: ImageData[] }
export type BallWorkerOut = { type: 'ready'; ep: string } | { type: 'result'; boxes: Box[][] } | { type: 'error'; message: string }

// Self-hosted runtime (no CDN): the .wasm is emitted by Vite; the JS glue is inlined in the webgpu bundle.
ort.env.wasm.wasmPaths = { wasm: wasmUrl }

let session: ort.InferenceSession | null = null
const post = (m: BallWorkerOut): void => (self as unknown as Worker).postMessage(m)

async function init(modelUrl: string): Promise<void> {
    const res = await fetch(modelUrl)
    if (!res.ok) throw new Error('model not found')
    const buf = new Uint8Array(await res.arrayBuffer())
    const options = { graphOptimizationLevel: 'all' as const }
    let ep = 'webgpu'
    try {
        session = await ort.InferenceSession.create(buf, { ...options, executionProviders: ['webgpu', 'wasm'] })
    } catch {
        ep = 'wasm'
        session = await ort.InferenceSession.create(buf, { ...options, executionProviders: ['wasm'] })
    }
    post({ type: 'ready', ep })
}

async function detect(tiles: ImageData[]): Promise<void> {
    if (!session) throw new Error('Ball model not ready')
    const boxes: Box[][] = []
    for (const tile of tiles) {
        const out = await session.run({ input: new ort.Tensor('float32', toTensorData(tile), [1, 3, TILE_SIZE, TILE_SIZE]) })
        boxes.push(decodeBalls(out.dets.data as Float32Array, out.labels.data as Float32Array))
    }
    post({ type: 'result', boxes })
}

self.onmessage = (e: MessageEvent<BallWorkerIn>): void => {
    const m = e.data
    const run = m.type === 'init' ? init(m.modelUrl) : detect(m.tiles)
    run.catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }))
}
