import { ALL_FORMATS, AudioSampleSink, Input } from 'mediabunny'
import { fileSource } from '../render/fileSource'
import { yieldToEventLoop } from '../render/yield'
import { downmix } from '../utils/audioFeatures'

export type MonoSink = (mono: Float32Array, sampleRate: number, timeSec: number) => void

/** Decodes a file's first audio track to mono chunks (via fileSource block reads). False when there is no audio track. */
export async function decodeMono(file: File, sink: MonoSink, signal: AbortSignal): Promise<boolean> {
    const input = new Input({ source: fileSource(file), formats: ALL_FORMATS })
    try {
        const track = await input.getPrimaryAudioTrack()
        if (!track) return false
        let n = 0
        for await (const s of new AudioSampleSink(track).samples()) {
            try {
                if (signal.aborted) throw new Error('Cancelled')
                const ch = s.numberOfChannels
                const buf = new Float32Array(s.numberOfFrames * ch)
                s.copyTo(buf, { planeIndex: 0, format: 'f32' })
                sink(downmix(buf, ch), s.sampleRate, s.timestamp)
            } finally {
                s.close()
            }
            if (++n % 50 === 0) await yieldToEventLoop()
        }
        return true
    } finally {
        input.dispose()
    }
}
