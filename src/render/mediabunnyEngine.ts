import {
    ALL_FORMATS, BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type InputAudioTrack, type InputVideoTrack, type StreamTargetChunk, type Target,
} from 'mediabunny'
import { fileSource } from './fileSource'
import { openGraphicsSession, type GraphicsSession, type OutItem } from './graphicsSession'
import { craToBla, lengthSize } from './nal'
import { encodeReplayAudio } from './replayAudio'
import { makeSilentAudio, type SilentAudio } from './silentAudio'
import type { Cut, GraphicsReport, RenderCard, RenderFn, RenderGraphics, RenderOptions, RenderOverlay, RenderSource } from './types'

const OUTPUT_NAME = 'highlights.mp4'

type OpenSource = {
    input: Input
    video: InputVideoTrack
    audio: InputAudioTrack | null
    /** End of the last video frame (presentation time), i.e. the real end of the file. */
    endSec: number
    config: VideoDecoderConfig
    /** NAL length-field size of the samples (avcC/hvcC). */
    nalLength: number
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
    const config = await video.getDecoderConfig()
    if (!config) {
        input.dispose()
        throw new Error(`${src.name}: video cannot be read in this browser`)
    }
    const hevc = video.codec === 'hevc'
    const nalLength = config.description ? lengthSize(config.description, hevc) : 4
    return { input, video, audio: await input.getPrimaryAudioTrack(), endSec, config, nalLength }
}

function blaAtCutStart(src: OpenSource, p: EncodedPacket): Uint8Array | null {
    return p.type === 'key' && src.video.codec === 'hevc' && src.config.description ? craToBla(p.data, src.nalLength) : null
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

const hasGraphics = (g: RenderGraphics | undefined): g is RenderGraphics => !!g && (!!g.intro || !!g.outro || g.overlays.length > 0)
const graphicLabels = (g: RenderGraphics): string[] => [g.intro?.label, ...g.overlays.map((o) => o.label), g.outro?.label].filter((l): l is string => !!l)
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

export const renderReel: RenderFn = async (cuts, sources, opts) => {
    const g = opts.graphics
    if (!hasGraphics(g)) return renderOnce(cuts, sources, opts, null)
    const report: GraphicsReport = { applied: [], skipped: [] }
    try {
        const out = await renderOnce(cuts, sources, opts, { graphics: g, report })
        opts.onGraphics?.(report)
        return out
    } catch (e) {
        if (isAbort(e)) throw e
        // Graphics must never cost the reel: render it again without them and say why.
        console.warn('Graphics failed, rendering without them', e)
        const out = await renderOnce(cuts, sources, opts, null)
        opts.onGraphics?.({ applied: [], skipped: graphicLabels(g).map((label) => ({ label, reason: errorText(e) })) })
        return out
    }
}

type GraphicsRun = { graphics: RenderGraphics; report: GraphicsReport }

async function renderOnce(cuts: Cut[], sources: RenderSource[], { onProgress, signal }: RenderOptions, run: GraphicsRun | null): Promise<File | Blob> {
    if (cuts.length === 0) throw new Error('Nothing to render')
    const used = new Set(cuts.map((c) => c.sourceIndex))
    const opened: OpenSource[] = []
    try {
        for (const [i, s] of sources.entries()) {
            if (used.has(i)) opened[i] = await openSource(s)
        }
        assertCompatible(opened, used)

        const first = opened[cuts[0].sourceIndex]
        const skip = (labels: string[], reason: string): void => { run?.report.skipped.push(...labels.map((label) => ({ label, reason }))) }

        // Graphics: one encoder for the reel, a sample entry that covers it and every clip, or none at all.
        let session: GraphicsSession | null = null
        if (run) {
            try {
                session = await openGraphicsSession([...used].map((i) => opened[i]), first)
            } catch (e) {
                skip(graphicLabels(run.graphics), errorText(e))
            }
        }
        const overlaysByCut = new Map<number, RenderOverlay[]>()
        for (const o of session ? run!.graphics.overlays : []) {
            if (!cuts[o.cutIndex]) { skip([o.label], 'its clip is not in the reel'); continue }
            overlaysByCut.set(o.cutIndex, [...(overlaysByCut.get(o.cutIndex) ?? []), o])
        }

        const span = (c: Cut): number => Math.max(0, Math.min(c.endSec, opened[c.sourceIndex].endSec) - c.startSec)
        const cardSec = (c: RenderCard | undefined): number => (session && c ? c.durationSec : 0)
        const total = (cuts.reduce((acc, c) => acc + span(c), 0) + cardSec(run?.graphics.intro) + cardSec(run?.graphics.outro)) || 1
        let done = 0

        // Cards are encoded before anything is written, so a failure just leaves the card out.
        const encodeCard = async (card: RenderCard | undefined, stage: string): Promise<EncodedPacket[] | null> => {
            if (!session || !card) return null
            try {
                const packets = await session.card(card, (f) => onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: Math.min(1, (done + f * card.durationSec) / total), stage }))
                run!.report.applied.push(card.label)
                return packets
            } catch (e) {
                skip([card.label], errorText(e))
                return null
            }
        }
        const intro = await encodeCard(run?.graphics.intro, 'Title card')
        if (intro) done += cardSec(run?.graphics.intro)

        const { target, result, discard } = await makeTarget()
        const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
        const vOut = new EncodedVideoPacketSource(first.video.codec!)
        output.addVideoTrack(vOut)
        const aOut = first.audio?.codec ? new EncodedAudioPacketSource(first.audio.codec) : null
        if (aOut) output.addAudioTrack(aOut)
        await output.start()

        const vMeta = { decoderConfig: session ? session.entry : first.config }
        const aMeta = first.audio ? { decoderConfig: (await first.audio.getDecoderConfig())! } : undefined
        // Slowed or quieter cuts (replays) get re-encoded audio: decoded, stretched, gain applied, AAC again.
        // If the browser can't, fall back to silent AAC frames so the audio track stays continuous;
        // without an AAC encoder at all, leave a gap. Silence is only prepared when first needed.
        let silence: SilentAudio | null | undefined
        const silencePackets = async (durationSec: number): Promise<EncodedPacket[] | null> => {
            if (silence === undefined) {
                silence = first.audio
                    ? await makeSilentAudio({ sampleRate: first.audio.sampleRate, numberOfChannels: first.audio.numberOfChannels }).catch(() => null)
                    : null
                if (!silence) console.warn('Replay audio: no AAC encoder, leaving a gap')
            }
            return silence ? silence.packets(durationSec) : null
        }
        let cursor = 0
        let vFirst = true
        let aFirst = true
        let copied = false
        const addVideo = async (p: EncodedPacket): Promise<void> => {
            await vOut.add(p, vFirst ? vMeta : undefined)
            vFirst = false
        }
        const addAudio = async (p: EncodedPacket): Promise<void> => {
            await aOut!.add(p, aFirst ? aMeta : undefined)
            aFirst = false
        }
        const addCard = async (packets: EncodedPacket[]): Promise<void> => {
            for (const p of packets) await addVideo(p.clone({ timestamp: cursor + p.timestamp }))
            const length = packets.length * session!.frameSec
            if (aOut) for (const p of (await silencePackets(length)) ?? []) await addAudio(p.clone({ timestamp: cursor + p.timestamp }))
            cursor += length
        }

        try {
            if (intro) await addCard(intro)
            for (const [ci, cut] of cuts.entries()) {
                if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                const src = opened[cut.sourceIndex]
                const speed = cut.speed ?? 1
                const gain = cut.gain ?? 1
                // Stream-copied audio can't be slowed or made quieter: those cuts are re-encoded.
                const reencode = !cut.silent && (speed !== 1 || gain !== 1)
                // Never trust the requested range: a cut past the end of the file would
                // otherwise inflate the timeline (there is no next key packet to stop at).
                const endSec = Math.min(cut.endSec, src.endSec)
                if (cut.startSec >= src.endSec || endSec <= cut.startSec) {
                    skip((overlaysByCut.get(ci) ?? []).map((o) => o.label), 'its clip is outside the file')
                    continue
                }

                const vSink = new EncodedPacketSink(src.video)
                const k0 = await vSink.getKeyPacket(cut.startSec) ?? await vSink.getFirstKeyPacket()
                if (!k0) continue
                // Keep whole GOPs: stop at the key packet after the one at/before the end.
                const kEnd = await vSink.getKeyPacket(endSec)
                const kStop = kEnd && kEnd.timestamp > k0.timestamp ? await vSink.getNextKeyPacket(kEnd) : await vSink.getNextKeyPacket(k0)
                const cutStart = k0.timestamp
                const offset = cursor - cutStart // only used for speed 1 (source audio)
                let videoEnd = cutStart

                // Open-GOP streams (e.g. x265 defaults): leading pictures follow the key
                // packet in decode order but display before it and reference the previous
                // GOP, which is not copied. Drop them; trailing pictures never reference them.
                async function* copiedPackets(): AsyncGenerator<EncodedPacket> {
                    for await (const p of vSink.packets(k0!, kStop ?? undefined)) if (p.timestamp >= cutStart) yield p
                }
                let items: AsyncIterable<OutItem> | OutItem[]
                const overlays = overlaysByCut.get(ci)
                if (session && overlays) {
                    // Overlays: the cut is read first, the GOPs under them re-encoded, then everything written.
                    const packets: EncodedPacket[] = []
                    for await (const p of copiedPackets()) packets.push(p)
                    const end = packets.reduce((m, p) => Math.max(m, p.timestamp + p.duration), cutStart)
                    onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, done / total), stage: 'Graphics' })
                    const r = await session.overlayCut(src, packets, end, overlays)
                    run!.report.applied.push(...r.applied)
                    run!.report.skipped.push(...r.skipped)
                    items = r.items
                } else {
                    items = (async function* () { for await (const p of copiedPackets()) yield { packet: p, generated: false, splice: false } })()
                }

                for await (const { packet: p, generated, splice } of items) {
                    // Slow motion: same encoded frames, timestamps and durations stretched by 1/speed.
                    const rel = (p.timestamp - cutStart) / speed
                    let data = p.data
                    if (!generated && p.type === 'key') {
                        // HEVC open GOP: the cut's first picture is a CRA whose leading pictures were dropped. Mark it
                        // BLA so decoders start a new sequence there; otherwise picture order continues from the
                        // previous clip and ffmpeg reorders/drops frames at the join ("non monotonically increasing dts").
                        const spliceHere = splice || p.timestamp === cutStart
                        if (session) data = session.footageKey(src, data, spliceHere)
                        else if (spliceHere) data = blaAtCutStart(src, p) ?? data
                    }
                    const q = data === p.data ? p : new EncodedPacket(data, p.type, p.timestamp, p.duration)
                    await addVideo(q.clone({ timestamp: cursor + rel, duration: p.duration / speed }))
                    copied = true
                    videoEnd = Math.max(videoEnd, p.timestamp + p.duration)
                    const within = Math.min(span(cut), Math.max(0, p.timestamp - cut.startSec))
                    onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, (done + within) / total) })
                }

                // End at the last copied frame (equals kStop for closed GOPs; open GOPs lose
                // the next key packet's leading pictures, so don't leave a hole for them).
                const cutEnd = videoEnd > cutStart ? videoEnd : (kStop ? kStop.timestamp : src.endSec)

                const outSpan = (cutEnd - cutStart) / speed
                if (cut.silent || reencode) {
                    if (aOut) {
                        let packets: EncodedPacket[] | null = null
                        if (reencode && src.audio) {
                            packets = await encodeReplayAudio(src.audio, { startSec: cutStart, endSec: cutEnd, speed, gain, outDurationSec: outSpan })
                                .catch((e: unknown) => { console.warn('Replay audio: re-encoding failed, using silence', e); return null })
                        }
                        packets ??= await silencePackets(outSpan)
                        for (const p of packets ?? []) await addAudio(p.clone({ timestamp: cursor + p.timestamp }))
                    }
                } else if (aOut && src.audio) {
                    const aSink = new EncodedPacketSink(src.audio)
                    const a0 = await aSink.getPacket(cutStart)
                    if (a0) {
                        for await (const p of aSink.packets(a0)) {
                            if (p.timestamp >= cutEnd) break
                            const ts = p.timestamp + offset
                            if (ts < cursor) continue
                            await addAudio(p.clone({ timestamp: ts }))
                        }
                    }
                }
                cursor += outSpan
                done += span(cut)
                onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, done / total) })
            }
            if (!copied) throw new Error('Nothing to render: every cut is outside its file')
            const outro = await encodeCard(run?.graphics.outro, 'Full-time card')
            if (outro) await addCard(outro)
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
