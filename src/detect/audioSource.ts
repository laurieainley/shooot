import { ALL_FORMATS, AudioSampleSink, CustomSource, EncodedPacketSink, Input, type Source } from 'mediabunny'
import { blockReader, exactReader, type ByteRangeReader } from '../render/fileSource'
import { yieldToEventLoop } from '../render/yield'
import { downmixInto } from '../utils/audioFeatures'
import { coalesceRanges, plannedReader, type ByteRange } from '../utils/readPlan'

export type MonoSink = (mono: Float32Array, sampleRate: number, timeSec: number) => void

/** Audio is handed on in chunks of about this many seconds (one worker message each, not one per ~21 ms packet). */
export const CHUNK_SEC = 2
/** Work this long (ms) before yielding to the event loop. */
const SLICE_MS = 50
/** Small blocks: only the bytes around audio packets are fetched. */
export const AUDIO_BLOCK = 256 * 1024
const MAX_IN_FLIGHT = 4
const READ_AHEAD = 8
const MAX_GAP = 1024 * 1024
const MAX_READ = 2 * 1024 * 1024

const sourceOver = (file: File, read: ByteRangeReader): Source =>
    new CustomSource({ getSize: () => file.size, read, maxCacheSize: 4 * 1024 * 1024 })

/**
 * Finds which byte ranges the audio packets will be read from, without fetching them: after the file's headers are
 * parsed (real reads through `base`), packet reads get zero bytes and are only recorded. Empty when anything fails.
 */
export async function planAudioReads(file: File, base: ByteRangeReader, signal: AbortSignal): Promise<ByteRange[]> {
    let fake = false
    const seen: ByteRange[] = []
    const input = new Input({ source: sourceOver(file, async (start, end) => {
        if (!fake) return base(start, end)
        seen.push({ start, end })
        return new Uint8Array(end - start)
    }), formats: ALL_FORMATS })
    try {
        const track = await input.getPrimaryAudioTrack()
        if (!track) return []
        fake = true
        let n = 0
        let t = performance.now()
        for await (const p of new EncodedPacketSink(track).packets()) {
            void p
            if (signal.aborted) return []
            if (performance.now() - t > SLICE_MS) { await yieldToEventLoop(); t = performance.now() }
            n++
        }
        return n > 0 ? coalesceRanges(seen, MAX_GAP, MAX_READ) : []
    } catch {
        return []
    } finally {
        input.dispose()
    }
}

/** Decodes a file's first audio track to mono chunks (via small-block reads around the audio). False when there is no audio track. */
export async function decodeMono(file: File, sink: MonoSink, signal: AbortSignal): Promise<boolean> {
    const base = blockReader(file, AUDIO_BLOCK, 32, { maxInFlight: MAX_IN_FLIGHT })
    const plan = await planAudioReads(file, base, signal)
    if (signal.aborted) throw new Error('Cancelled')
    const read = plan.length > 0 ? plannedReader(plan, exactReader(file, MAX_IN_FLIGHT), base, READ_AHEAD) : base
    const input = new Input({ source: sourceOver(file, read), formats: ALL_FORMATS })
    try {
        const track = await input.getPrimaryAudioTrack()
        if (!track) return false
        let acc: Float32Array | null = null, fill = 0, accRate = 0, accTime = 0
        const flush = (): void => {
            if (acc && fill > 0) sink(acc.subarray(0, fill).slice(), accRate, accTime)
            acc = null; fill = 0
        }
        let t = performance.now()
        for await (const s of new AudioSampleSink(track).samples()) {
            try {
                if (signal.aborted) throw new Error('Cancelled')
                if (acc && (s.sampleRate !== accRate || fill + s.numberOfFrames > acc.length)) flush()
                const ch = s.numberOfChannels
                const buf = new Float32Array(s.numberOfFrames * ch)
                s.copyTo(buf, { planeIndex: 0, format: 'f32' })
                if (!acc) { acc = new Float32Array(Math.ceil(CHUNK_SEC * s.sampleRate) + s.numberOfFrames); accRate = s.sampleRate; accTime = s.timestamp }
                fill += downmixInto(buf, ch, acc, fill)
                if (fill >= CHUNK_SEC * accRate) flush()
            } finally {
                s.close()
            }
            if (performance.now() - t > SLICE_MS) { await yieldToEventLoop(); t = performance.now() }
        }
        flush()
        return true
    } finally {
        input.dispose()
    }
}
