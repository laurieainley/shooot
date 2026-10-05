import { AudioSampleSink, EncodedPacket, type InputAudioTrack } from 'mediabunny'
import { timeStretch } from './audioStretch'

export type ReplayAudioOptions = {
    startSec: number       // source span to take the audio from
    endSec: number
    speed: number          // replay speed: the audio is stretched by 1 / speed, pitch kept
    gain: number           // volume factor (0.5 = −6 dB)
    outDurationSec: number // length of the replay in the output
}

const AAC_FRAME = 1024

/** Pad with silence or trim interleaved samples to exactly `frames` frames. */
export function fitFrames(samples: Float32Array, channels: number, frames: number): Float32Array {
    const want = frames * channels
    if (samples.length === want) return samples
    const out = new Float32Array(want)
    out.set(samples.subarray(0, Math.min(want, samples.length)))
    return out
}

export function applyGain(samples: Float32Array, gain: number): void {
    if (gain === 1) return
    for (let i = 0; i < samples.length; i++) samples[i] *= gain
}

/**
 * AAC encoders delay the signal by their priming samples. Drop the leading chunks that carry only that delay:
 * those stamped before zero if the encoder says so, otherwise the surplus over the frames we fed in.
 */
export function leadingChunksToDrop(timestampsUs: number[], wanted: number): number {
    const surplus = Math.max(0, timestampsUs.length - wanted)
    const negative = timestampsUs.filter((t) => t < 0).length
    return Math.min(surplus, negative > 0 ? negative : surplus)
}

/** Decode [startSec, endSec) of the track to interleaved float samples. */
async function decodeSpan(track: InputAudioTrack, startSec: number, endSec: number, channels: number): Promise<Float32Array> {
    const parts: Float32Array[] = []
    let total = 0
    for await (const s of new AudioSampleSink(track).samples(startSec, endSec)) {
        try {
            const rate = s.sampleRate
            const skip = Math.max(0, Math.round((startSec - s.timestamp) * rate))
            const keep = Math.min(s.numberOfFrames, Math.round((endSec - s.timestamp) * rate)) - skip
            if (keep <= 0) continue
            const buf = new Float32Array(keep * channels)
            s.copyTo(buf, { planeIndex: 0, format: 'f32', frameOffset: skip, frameCount: keep })
            parts.push(buf)
            total += buf.length
        } finally {
            s.close()
        }
    }
    const pcm = new Float32Array(total)
    let at = 0
    for (const p of parts) { pcm.set(p, at); at += p.length }
    return pcm
}

/**
 * Slowed replay audio: decode the source span (WebCodecs, via mediabunny), stretch it to the replay's length
 * keeping the pitch, apply the gain and encode it as AAC-LC with the source's rate and channels.
 * Returns packets covering `outDurationSec` (timestamps from 0), or null when the browser cannot do it.
 */
export async function encodeReplayAudio(track: InputAudioTrack, opts: ReplayAudioOptions): Promise<EncodedPacket[] | null> {
    if (typeof globalThis.AudioEncoder === 'undefined' || typeof globalThis.AudioDecoder === 'undefined') return null
    const sampleRate = track.sampleRate
    const channels = track.numberOfChannels
    const config: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 128_000 }
    const support = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }))
    if (!support.supported || !(await track.canDecode())) return null

    const pcm = await decodeSpan(track, opts.startSec, opts.endSec, channels)
    if (pcm.length === 0) return null
    const stretched = timeStretch(pcm, channels, opts.speed)
    applyGain(stretched, opts.gain)
    const frameSec = AAC_FRAME / sampleRate
    const wanted = Math.ceil(opts.outDurationSec / frameSec - 1e-9)
    const samples = fitFrames(stretched, channels, wanted * AAC_FRAME)

    const chunks: EncodedAudioChunk[] = []
    let failure: unknown = null
    const encoder = new AudioEncoder({ output: (c) => chunks.push(c), error: (e) => { failure = e } })
    encoder.configure(config)
    const block = sampleRate // feed one second at a time
    for (let f = 0; f < wanted * AAC_FRAME; f += block) {
        const n = Math.min(block, wanted * AAC_FRAME - f)
        const data = new AudioData({
            format: 'f32', sampleRate, numberOfChannels: channels, numberOfFrames: n,
            timestamp: Math.round((f / sampleRate) * 1e6), data: samples.subarray(f * channels, (f + n) * channels),
        })
        encoder.encode(data)
        data.close()
    }
    await encoder.flush()
    encoder.close()
    if (failure || chunks.length === 0) return null

    const usable = chunks.slice(leadingChunksToDrop(chunks.map((c) => c.timestamp), wanted)).slice(0, wanted)
    return usable.map((c, i) => EncodedPacket.fromEncodedChunk(c).clone({ timestamp: i * frameSec, duration: frameSec }))
}
