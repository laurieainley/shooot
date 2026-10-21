import { EncodedAudioPacketSource, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output, type AudioCodec, type VideoCodec } from 'mediabunny'
import { makeTarget } from './sourceInput'
import { abortable } from './abortable'
import { readUnit, removeUnit, type JobKind } from './renderJob'

/** Writes the saved units of a journaled render into the MP4, deleting each log once it is copied. */
export async function muxUnits(kind: JobKind, name: string, unitCount: number, videoCodec: VideoCodec, audioCodec: AudioCodec | null, video: VideoDecoderConfig, audio: AudioDecoderConfig | null, signal?: AbortSignal, into?: FileSystemFileHandle): Promise<File | Blob> {
    const { target, result, discard } = await makeTarget(name, into)
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
    const vOut = new EncodedVideoPacketSource(videoCodec)
    output.addVideoTrack(vOut)
    const aOut = audio && audioCodec ? new EncodedAudioPacketSource(audioCodec) : null
    if (aOut) output.addAudioTrack(aOut)
    try {
        await output.start()
        let vFirst = true
        let aFirst = true
        for (let u = 0; u < unitCount; u++) {
            if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
            for await (const r of readUnit(kind, u)) {
                const p = new EncodedPacket(r.data, r.key ? 'key' : 'delta', r.timestamp, r.duration)
                if (r.track === 0) { await abortable(vOut.add(p, vFirst ? { decoderConfig: video } : undefined), signal); vFirst = false }
                else if (aOut) { await abortable(aOut.add(p, aFirst ? { decoderConfig: audio! } : undefined), signal); aFirst = false }
            }
            await removeUnit(kind, u)
        }
        await abortable(output.finalize(), signal)
        return await abortable(result(), signal)
    } catch (e) {
        await output.cancel().catch(() => undefined)
        await discard()
        throw e
    }
}

