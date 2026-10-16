// Cuts keyframe-aligned pieces out of a file and remuxes them (no re-encode) to fragmented MP4 for a SourceBuffer.
// Timestamps are the source's own: a fragmented mediabunny output keeps them in the moof's tfdt (it only shifts
// when the first timestamp is negative), so the SourceBuffer's `timestampOffset` alone maps them to file time.
import {
    ALL_FORMATS, BufferTarget, CustomSource, EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, type InputAudioTrack, type InputVideoTrack,
} from 'mediabunny'
import { blockReader } from '../render/fileSource'
import { mseMime } from './msePlan'

export type SegmentBytes = { init: Uint8Array; media: Uint8Array }
export type Segment = {
    /** Source-time span this piece covers (start is a keyframe, end is the next keyframe or the end of the file). */
    start: number
    end: number
    last: boolean
    video: SegmentBytes
    audio: SegmentBytes | null
}

export type MseSource = {
    input: Input
    videoMime: string
    audioMime: string | null
    /** Source time of the first frame; the SourceBuffers' timestampOffset is minus this. */
    base: number
    /** Source time of the end of the file. */
    endSec: number
    video: { track: InputVideoTrack; sink: EncodedPacketSink; config: VideoDecoderConfig; codec: NonNullable<InputVideoTrack['codec']> }
    audio: { track: InputAudioTrack; sink: EncodedPacketSink; config: AudioDecoderConfig; codec: NonNullable<InputAudioTrack['codec']> } | null
    dispose(): void
}

export type OpenResult = { ok: true; source: MseSource } | { ok: false; reason: string }

/** Opens a file's primary video and audio tracks (data and timecode tracks are ignored). */
export async function openMseSource(file: File): Promise<OpenResult> {
    const read = blockReader(file)
    const input = new Input({ source: new CustomSource({ getSize: () => file.size, read, maxCacheSize: 4 * 1024 * 1024 }), formats: ALL_FORMATS })
    try {
        const vt = await input.getPrimaryVideoTrack()
        if (!vt) { input.dispose(); return { ok: false, reason: 'no video track' } }
        const vCodec = vt.codec
        const vConfig = await vt.getDecoderConfig()
        const vString = await vt.getCodecParameterString()
        if (!vCodec || !vConfig || !vString) { input.dispose(); return { ok: false, reason: 'video codec unknown' } }
        const at = await input.getPrimaryAudioTrack()
        const aCodec = at?.codec ?? null
        const aConfig = at ? await at.getDecoderConfig() : null
        const aString = at ? await at.getCodecParameterString() : null
        const withAudio = !!(at && aCodec && aConfig && aString)
        const tracks = withAudio ? [vt, at as InputAudioTrack] : [vt]
        const firsts = await Promise.all(tracks.map((t) => t.getFirstTimestamp()))
        const endSec = await input.computeDuration(tracks)
        return {
            ok: true,
            source: {
                input,
                videoMime: mseMime('video', vString),
                audioMime: withAudio ? mseMime('audio', aString as string) : null,
                base: Math.max(0, Math.min(...firsts)),
                endSec,
                video: { track: vt, sink: new EncodedPacketSink(vt), config: vConfig, codec: vCodec },
                audio: withAudio ? { track: at as InputAudioTrack, sink: new EncodedPacketSink(at as InputAudioTrack), config: aConfig as AudioDecoderConfig, codec: aCodec as NonNullable<InputAudioTrack['codec']> } : null,
                dispose: () => input.dispose(),
            },
        }
    } catch (e) {
        input.dispose()
        return { ok: false, reason: `cannot read file: ${e instanceof Error ? e.message : String(e)}` }
    }
}

/** Index of the first top-level `moof` box: everything before it is the init segment (ftyp + moov). */
export function splitInit(bytes: Uint8Array): SegmentBytes {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let pos = 0
    while (pos + 8 <= bytes.byteLength) {
        let size = view.getUint32(pos)
        const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
        if (type === 'moof') return { init: bytes.subarray(0, pos), media: bytes.subarray(pos) }
        if (size === 1 && pos + 16 <= bytes.byteLength) size = Number(view.getBigUint64(pos + 8))
        if (size < 8) break
        pos += size
    }
    return { init: bytes, media: new Uint8Array(0) }
}

const EPS = 1e-6

async function mux(packets: AsyncIterable<EncodedPacket>, kind: 'video' | 'audio', src: MseSource, signal: AbortSignal): Promise<SegmentBytes> {
    const target = new BufferTarget()
    // One fragment per piece: the whole GOP-aligned run goes into a single moof + mdat.
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: Infinity }), target })
    let add: (p: EncodedPacket, meta: object) => Promise<void>
    let close: () => void
    let meta: object
    if (kind === 'video') {
        const source = new EncodedVideoPacketSource(src.video.codec)
        output.addVideoTrack(source, { frameRate: undefined })
        add = (p, m) => source.add(p, m as EncodedVideoChunkMetadata)
        close = () => source.close()
        meta = { decoderConfig: src.video.config }
    } else {
        const a = src.audio!
        const source = new EncodedAudioPacketSource(a.codec)
        output.addAudioTrack(source)
        add = (p, m) => source.add(p, m as EncodedAudioChunkMetadata)
        close = () => source.close()
        meta = { decoderConfig: a.config }
    }
    await output.start()
    try {
        let first = true
        for await (const p of packets) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
            await add(p, first ? meta : {})
            first = false
        }
        close()
        await output.finalize()
    } catch (e) {
        await output.cancel().catch(() => undefined)
        throw e
    }
    return splitInit(new Uint8Array(target.buffer!))
}

async function* videoPackets(src: MseSource, key: EncodedPacket, next: EncodedPacket | null): AsyncGenerator<EncodedPacket> {
    for await (const p of src.video.sink.packets(key, next ?? undefined)) yield p
}

async function* audioPackets(src: MseSource, start: number, end: number): AsyncGenerator<EncodedPacket> {
    const sink = src.audio!.sink
    let p = await sink.getPacket(start - EPS)
    // The packet at or before `start` belongs to the previous piece unless it begins exactly there.
    if (p && p.timestamp < start - 1e-4) p = await sink.getNextPacket(p)
    if (!p) p = await sink.getFirstPacket()
    while (p && p.timestamp < end - 1e-4) {
        yield p
        p = await sink.getNextPacket(p)
    }
}

/**
 * Builds the piece that starts at the keyframe at or before `from` and runs to the first keyframe at least `targetSec`
 * later. Throws AbortError when `signal` aborts while it is being cut.
 */
export async function buildSegment(src: MseSource, from: number, targetSec: number, signal: AbortSignal): Promise<Segment> {
    const sink = src.video.sink
    const key = (await sink.getKeyPacket(from + EPS)) ?? (await sink.getFirstKeyPacket())
    if (!key) throw new Error('no keyframe')
    let next = await sink.getNextKeyPacket(key, { metadataOnly: true })
    while (next && next.timestamp - key.timestamp < targetSec) next = await sink.getNextKeyPacket(next, { metadataOnly: true })
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const end = next ? next.timestamp : src.endSec
    const [video, audio] = await Promise.all([
        mux(videoPackets(src, key, next), 'video', src, signal),
        src.audio ? mux(audioPackets(src, key.timestamp, end), 'audio', src, signal) : Promise.resolve(null),
    ])
    return { start: key.timestamp, end, last: !next, video, audio }
}
