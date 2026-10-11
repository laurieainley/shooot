import { FeatureAccumulator, type AudioFeatures } from '../utils/audioFeatures'

export type FeatureExtractor = { push: (mono: Float32Array, sampleRate: number) => void; finish: () => Promise<AudioFeatures | null>; dispose: () => void }

/** Audio features for one file, in a Web Worker when available (chunks are transferred), else on this thread. */
export function createFeatureExtractor(cfg: { hopSec: number; voiceHz: readonly [number, number] }, useWorker = typeof Worker !== 'undefined'): FeatureExtractor {
    if (!useWorker) {
        let acc: FeatureAccumulator | null = null
        return {
            // The first chunk's sample rate is used for the whole file.
            push: (mono, sr) => { (acc ??= new FeatureAccumulator(sr, cfg.hopSec, cfg.voiceHz)).push(mono) },
            finish: async () => acc?.finish() ?? null,
            dispose: () => { acc = null },
        }
    }
    const worker = new Worker(new URL('./audioFeatures.worker.ts', import.meta.url), { type: 'module' })
    let started = false
    let failure: Error | null = null
    let pending: { resolve: (f: AudioFeatures | null) => void; reject: (e: Error) => void } | null = null
    const fail = (e: Error): void => { failure ??= e; const p = pending; pending = null; p?.reject(e) }
    worker.onerror = (e) => fail(new Error(e.message || 'Audio analysis failed'))
    worker.onmessageerror = () => fail(new Error('Audio analysis failed'))
    worker.onmessage = (e: MessageEvent<AudioFeatures | null>) => { const p = pending; pending = null; p?.resolve(e.data) }
    return {
        // The first chunk's sample rate is used for the whole file.
        push: (mono, sr) => {
            if (failure) return
            if (!started) { worker.postMessage({ type: 'start', sampleRate: sr, hopSec: cfg.hopSec, voiceHz: [...cfg.voiceHz] }); started = true }
            worker.postMessage({ type: 'chunk', data: mono }, [mono.buffer])
        },
        finish: () => new Promise((resolve, reject) => {
            if (failure) { reject(failure); return }
            if (!started) { resolve(null); return }
            pending = { resolve, reject }
            worker.postMessage({ type: 'end' })
        }),
        dispose: () => { fail(new Error('Cancelled')); worker.terminate() },
    }
}
