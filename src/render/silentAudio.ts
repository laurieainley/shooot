import { EncodedPacket } from 'mediabunny'

export type SilentAudio = {
    frameSec: number
    /** Packets covering `durationSec`, timestamps starting at 0. */
    packets: (durationSec: number) => EncodedPacket[]
}

// Encodes one second of silence once, then reuses those AAC frames for any duration.
export async function makeSilentAudio(cfg: { sampleRate: number; numberOfChannels: number }): Promise<SilentAudio | null> {
    if (typeof globalThis.AudioEncoder === 'undefined') return null
    const config: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: cfg.sampleRate, numberOfChannels: cfg.numberOfChannels, bitrate: 96_000 }
    const support = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }))
    if (!support.supported) return null

    const chunks: EncodedAudioChunk[] = []
    const encoder = new AudioEncoder({ output: (c) => chunks.push(c), error: () => undefined })
    encoder.configure(config)
    const frames = cfg.sampleRate // one second
    encoder.encode(new AudioData({
        format: 'f32-planar', sampleRate: cfg.sampleRate, numberOfFrames: frames,
        numberOfChannels: cfg.numberOfChannels, timestamp: 0,
        data: new Float32Array(frames * cfg.numberOfChannels),
    }))
    await encoder.flush()
    encoder.close()
    if (chunks.length === 0) return null

    const frameSec = 1024 / cfg.sampleRate
    // Skip the first chunk (encoder priming), loop the steady-state frames.
    const loop = chunks.length > 2 ? chunks.slice(1, -1) : chunks
    return {
        frameSec,
        packets: (durationSec) => {
            const n = Math.ceil(durationSec / frameSec)
            return Array.from({ length: n }, (_, i) =>
                EncodedPacket.fromEncodedChunk(loop[i % loop.length]).clone({ timestamp: i * frameSec, duration: frameSec }))
        },
    }
}
