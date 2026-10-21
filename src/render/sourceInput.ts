// Opening a source file and the output target, shared by the stream-copy engine and the re-encoding one.
import {
    ALL_FORMATS, BufferTarget, EncodedPacketSink, Input, StreamTarget,
    type InputAudioTrack, type InputVideoTrack, type StreamTargetChunk, type Target,
} from 'mediabunny'
import { clearOldOutputs } from './storage'
import { fileSource } from './fileSource'
import { lengthSize } from './nal'
import type { RenderSource } from './types'

export type OpenSource = {
    input: Input
    video: InputVideoTrack
    audio: InputAudioTrack | null
    /** End of the last video frame (presentation time), i.e. the real end of the file. */
    endSec: number
    config: VideoDecoderConfig
    /** NAL length-field size of the samples (avcC/hvcC). */
    nalLength: number
}

export async function openSource(src: RenderSource): Promise<OpenSource> {
    const input = new Input({ source: fileSource(src.file), formats: ALL_FORMATS })
    const video = await input.getPrimaryVideoTrack()
    if (!video?.codec) {
        input.dispose()
        throw new Error(`${src.name}: no readable video track`)
    }
    const last = await new EncodedPacketSink(video).getPacket(Infinity)
    const endSec = last ? last.timestamp + last.duration : await video.computeDuration()
    const config = await video.getDecoderConfig()
    if (!config) {
        input.dispose()
        throw new Error(`${src.name}: video cannot be read in this browser`)
    }
    const hevc = video.codec === 'hevc'
    const nalLength = config.description ? lengthSize(config.description, hevc) : 4
    return { input, video, audio: await input.getPrimaryAudioTrack(), endSec, config, nalLength }
}

export type OutputTarget = { target: Target; result: () => Promise<File | Blob>; discard: () => Promise<void> }

export async function makeTarget(name: string, into?: FileSystemFileHandle): Promise<OutputTarget> {
    try {
        const root = await navigator.storage.getDirectory()
        await clearOldOutputs() // earlier renders (other names included) would otherwise fill the site's storage
        if (!into) await root.removeEntry(name).catch(() => undefined)
        // Benchmarks (experiment 4): `into` is a file the user picked; the MP4 is streamed straight into it.
        const handle = into ?? await root.getFileHandle(name, { create: true })
        const writable = await handle.createWritable()
        const sink = new WritableStream<StreamTargetChunk>({
            write: (c) => writable.write({ type: 'write', position: c.position, data: c.data }),
            close: () => writable.close(),
            abort: () => writable.abort(),
        })
        return {
            target: new StreamTarget(sink, { chunked: true }),
            result: () => handle.getFile(),
            // A writable that was never closed keeps a swap copy of the file (in WebKit and Chrome): abort it first (a no-op once it is closed).
            discard: async () => { await writable.abort().catch(() => undefined); if (!into) await root.removeEntry(name).catch(() => undefined) },
        }
    } catch (e) {
        // The picked file cannot be written (permission lost, file locked or gone): say so, never fall back to memory for a file the user chose.
        if (into) throw new Error(`Could not write to the file you picked (${e instanceof Error ? e.message : String(e)}). Pick it again, or choose another place.`)
        const target = new BufferTarget()
        return {
            target,
            result: async () => new Blob([target.buffer!], { type: 'video/mp4' }),
            discard: async () => undefined,
        }
    }
}

