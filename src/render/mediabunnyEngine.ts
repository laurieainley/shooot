import {
    ALL_FORMATS, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type InputAudioTrack, type InputVideoTrack, type StreamTargetChunk, type Target,
} from 'mediabunny'
import { fileSource } from './fileSource'
import type { Cut, RenderFn, RenderSource } from './types'

const OUTPUT_NAME = 'highlights.mp4'

type OpenSource = {
    input: Input
    video: InputVideoTrack
    audio: InputAudioTrack | null
    /** End of the last video frame (presentation time), i.e. the real end of the file. */
    endSec: number
}

async function openSource(src: RenderSource): Promise<OpenSource> {
    const input = new Input({ source: fileSource(src.file), formats: ALL_FORMATS })
    const video = await input.getPrimaryVideoTrack()
    if (!video?.codec) {
        input.dispose()
        throw new Error(`${src.name}: no readable video track`)
    }
    const last = await new EncodedPacketSink(video).getPacket(Infinity)
    const endSec = last ? last.timestamp + last.duration : await video.computeDuration()
    return { input, video, audio: await input.getPrimaryAudioTrack(), endSec }
}

type OutputTarget = { target: Target; result: () => Promise<File | Blob>; discard: () => Promise<void> }

async function makeTarget(): Promise<OutputTarget> {
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(OUTPUT_NAME).catch(() => undefined)
        const handle = await root.getFileHandle(OUTPUT_NAME, { create: true })
        const writable = await handle.createWritable()
        const sink = new WritableStream<StreamTargetChunk>({
            write: (c) => writable.write({ type: 'write', position: c.position, data: c.data }),
            close: () => writable.close(),
            abort: () => writable.abort(),
        })
        return {
            target: new StreamTarget(sink, { chunked: true }),
            result: () => handle.getFile(),
            discard: () => root.removeEntry(OUTPUT_NAME).catch(() => undefined),
        }
    } catch {
        const target = new BufferTarget()
        return {
            target,
            result: async () => new Blob([target.buffer!], { type: 'video/mp4' }),
            discard: async () => undefined,
        }
    }
}

function assertCompatible(sources: OpenSource[], used: Set<number>): void {
    const vc = new Set([...used].map((i) => sources[i].video.codec))
    const ac = new Set([...used].map((i) => {
        const a = sources[i].audio
        return a ? `${a.codec}/${a.sampleRate}/${a.numberOfChannels}` : 'none'
    }))
    if (vc.size > 1) throw new Error('Clips use different video codecs (e.g. HEVC and H.264) and cannot be joined without re-encoding')
    if (ac.size > 1) throw new Error('Clips use different audio formats and cannot be joined without re-encoding')
}

export const renderReel: RenderFn = async (cuts: Cut[], sources: RenderSource[], { onProgress, signal }) => {
    if (cuts.length === 0) throw new Error('Nothing to render')
    const used = new Set(cuts.map((c) => c.sourceIndex))
    const opened: OpenSource[] = []
    try {
        for (const [i, s] of sources.entries()) {
            if (used.has(i)) opened[i] = await openSource(s)
        }
        assertCompatible(opened, used)

        const first = opened[cuts[0].sourceIndex]
        const { target, result, discard } = await makeTarget()
        const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
        const vOut = new EncodedVideoPacketSource(first.video.codec!)
        output.addVideoTrack(vOut)
        const aOut = first.audio?.codec ? new EncodedAudioPacketSource(first.audio.codec) : null
        if (aOut) output.addAudioTrack(aOut)
        await output.start()

        const vMeta = { decoderConfig: (await first.video.getDecoderConfig())! }
        const aMeta = first.audio ? { decoderConfig: (await first.audio.getDecoderConfig())! } : undefined
        const span = (c: Cut): number => Math.max(0, Math.min(c.endSec, opened[c.sourceIndex].endSec) - c.startSec)
        const total = cuts.reduce((acc, c) => acc + span(c), 0) || 1
        let cursor = 0
        let done = 0
        let vFirst = true
        let aFirst = true

        try {
            for (const [ci, cut] of cuts.entries()) {
                if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                const src = opened[cut.sourceIndex]
                // Never trust the requested range: a cut past the end of the file would
                // otherwise inflate the timeline (there is no next key packet to stop at).
                const endSec = Math.min(cut.endSec, src.endSec)
                if (cut.startSec >= src.endSec || endSec <= cut.startSec) continue

                const vSink = new EncodedPacketSink(src.video)
                const k0 = await vSink.getKeyPacket(cut.startSec) ?? await vSink.getFirstKeyPacket()
                if (!k0) continue
                // Keep whole GOPs: stop at the key packet after the one at/before the end.
                const kEnd = await vSink.getKeyPacket(endSec)
                const kStop = kEnd && kEnd.timestamp > k0.timestamp ? await vSink.getNextKeyPacket(kEnd) : await vSink.getNextKeyPacket(k0)
                const cutStart = k0.timestamp
                const cutEnd = kStop ? kStop.timestamp : src.endSec
                const offset = cursor - cutStart

                for await (const p of vSink.packets(k0, kStop ?? undefined)) {
                    await vOut.add(p.clone({ timestamp: p.timestamp + offset }), vFirst ? vMeta : undefined)
                    vFirst = false
                    const within = Math.min(span(cut), Math.max(0, p.timestamp - cut.startSec))
                    onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, (done + within) / total) })
                }

                if (aOut && src.audio) {
                    const aSink = new EncodedPacketSink(src.audio)
                    const a0 = await aSink.getPacket(cutStart)
                    if (a0) {
                        for await (const p of aSink.packets(a0)) {
                            if (p.timestamp >= cutEnd) break
                            const ts = p.timestamp + offset
                            if (ts < cursor) continue
                            await aOut.add(p.clone({ timestamp: ts }), aFirst ? aMeta : undefined)
                            aFirst = false
                        }
                    }
                }
                cursor += cutEnd - cutStart
                done += span(cut)
                onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, done / total) })
            }
            if (vFirst) throw new Error('Nothing to render: every cut is outside its file')
            await output.finalize()
            return await result()
        } catch (e) {
            await output.cancel().catch(() => undefined)
            await discard()
            throw e
        }
    } finally {
        for (const s of opened) s?.input.dispose()
    }
}
