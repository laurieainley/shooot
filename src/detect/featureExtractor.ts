import { FeatureAccumulator, type AudioFeatures } from '../utils/audioFeatures'

export type FeatureExtractor = { push: (mono: Float32Array, sampleRate: number) => void; finish: () => Promise<AudioFeatures | null>; dispose: () => void }

/** Audio features for one file, in a Web Worker when available (chunks are transferred), else on this thread. */
export function createFeatureExtractor(cfg: { hopSec: number; voiceHz: readonly [number, number] }, useWorker = typeof Worker !== 'undefined'): FeatureExtractor {
    if (!useWorker) {
        let acc: FeatureAccumulator | null = null
        return {
            push: (mono, sr) => { (acc ??= new FeatureAccumulator(sr, cfg.hopSec, cfg.voiceHz)).push(mono) },
            finish: async () => acc?.finish() ?? null,
            dispose: () => { acc = null },
        }
    }
    const worker = new Worker(new URL('./audioFeatures.worker.ts', import.meta.url), { type: 'module' })
    let started = false
    return {
        push: (mono, sr) => {
            if (!started) { worker.postMessage({ type: 'start', sampleRate: sr, hopSec: cfg.hopSec, voiceHz: [...cfg.voiceHz] }); started = true }
            worker.postMessage({ type: 'chunk', data: mono }, [mono.buffer])
        },
        finish: () => new Promise((resolve, reject) => {
            if (!started) { resolve(null); return }
            worker.onmessage = (e: MessageEvent<AudioFeatures | null>) => resolve(e.data)
            worker.onerror = (e) => reject(new Error(e.message || 'Audio analysis failed'))
            worker.postMessage({ type: 'end' })
        }),
        dispose: () => worker.terminate(),
    }
}
