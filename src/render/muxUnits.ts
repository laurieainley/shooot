import { EncodedAudioPacketSource, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output, type AudioCodec, type VideoCodec } from 'mediabunny'
import { makeTarget } from './sourceInput'
import { readUnit, removeUnit } from './renderJob'

/** Writes the saved units of a journaled render into the MP4, deleting each log once it is copied. */
export async function muxUnits(name: string, unitCount: number, videoCodec: VideoCodec, audioCodec: AudioCodec | null, video: VideoDecoderConfig, audio: AudioDecoderConfig | null, signal?: AbortSignal, into?: FileSystemFileHandle): Promise<File | Blob> {
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
            for await (const r of readUnit(u)) {
                const p = new EncodedPacket(r.data, r.key ? 'key' : 'delta', r.timestamp, r.duration)
                if (r.track === 0) { await vOut.add(p, vFirst ? { decoderConfig: video } : undefined); vFirst = false }
                else if (aOut) { await aOut.add(p, aFirst ? { decoderConfig: audio! } : undefined); aFirst = false }
            }
            await removeUnit(u)
        }
        await output.finalize()
        return await result()
    } catch (e) {
        await output.cancel().catch(() => undefined)
        await discard()
        throw e
    }
}

