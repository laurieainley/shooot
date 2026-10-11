import { FeatureAccumulator } from '../utils/audioFeatures'

type In = { type: 'start'; sampleRate: number; hopSec: number; voiceHz: [number, number] } | { type: 'chunk'; data: Float32Array } | { type: 'end' }
let acc: FeatureAccumulator | null = null
self.onmessage = (e: MessageEvent<In>): void => {
    const m = e.data
    if (m.type === 'start') acc = new FeatureAccumulator(m.sampleRate, m.hopSec, m.voiceHz)
    else if (m.type === 'chunk') acc?.push(m.data)
    else {
        const f = acc?.finish() ?? null
        if (f) (self as unknown as Worker).postMessage({ loudDb: f.loudDb, voiceDb: f.voiceDb, hopSec: f.hopSec }, [f.loudDb.buffer, f.voiceDb.buffer])
        else (self as unknown as Worker).postMessage(null)
        acc = null
    }
}
