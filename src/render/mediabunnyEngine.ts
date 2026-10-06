import {
    ALL_FORMATS, BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink,
    EncodedVideoPacketSource, Input, Mp4OutputFormat, Output, StreamTarget,
    type InputAudioTrack, type InputVideoTrack, type StreamTargetChunk, type Target,
} from 'mediabunny'
import { cropLabels, cropOverlayFor } from './cropOverlay'
import { fileSource } from './fileSource'
import { openGraphicsSession, type GraphicsSession, type OutItem } from './graphicsSession'
import { hasInbandParams, planJoin, profileOf, type JoinPlan } from './joinParams'
import { craToBla, lengthSize, withInbandParams } from './nal'
import { overlayRegions } from './overlayRegions'
import { encodeReplayAudio } from './replayAudio'
import { makeSilentAudio, type SilentAudio } from './silentAudio'
import { canJournal, discardJob, loadJob, openUnit, readUnit, removeUnit, saveJob, type JobState, type UnitWriter } from './renderJob'
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

async function makeTarget(name: string): Promise<OutputTarget> {
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(name).catch(() => undefined)
        const handle = await root.getFileHandle(name, { create: true })
        const writable = await handle.createWritable()
        const sink = new WritableStream<StreamTargetChunk>({
            write: (c) => writable.write({ type: 'write', position: c.position, data: c.data }),
            close: () => writable.close(),
            abort: () => writable.abort(),
        })
        return {
            target: new StreamTarget(sink, { chunked: true }),
            result: () => handle.getFile(),
            discard: () => root.removeEntry(name).catch(() => undefined),
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
    const vp = new Set([...used].map((i) => `${sources[i].video.codec}/${profileOf(sources[i].config.codec)}`))
    if (vc.size === 1 && vp.size > 1) throw new Error('Clips use different video profiles (e.g. 8-bit and 10-bit) and cannot be joined without re-encoding')
    if (vc.size > 1) throw new Error('Clips use different video codecs (e.g. HEVC and H.264) and cannot be joined without re-encoding')
    if (ac.size > 1) throw new Error('Clips use different audio formats and cannot be joined without re-encoding')
}

/** Writes the saved units of a journaled render into the MP4, deleting each log once it is copied. */
async function muxUnits(name: string, unitCount: number, first: OpenSource, video: VideoDecoderConfig, audio: AudioDecoderConfig | null, signal?: AbortSignal): Promise<File | Blob> {
    const { target, result, discard } = await makeTarget(name)
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
    const vOut = new EncodedVideoPacketSource(first.video.codec!)
    output.addVideoTrack(vOut)
    const aOut = audio && first.audio?.codec ? new EncodedAudioPacketSource(first.audio.codec) : null
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

const hasGraphics = (g: RenderGraphics | undefined): g is RenderGraphics => !!g && (!!g.intro || !!g.outro || g.overlays.length > 0)
const graphicLabels = (g: RenderGraphics): string[] => [g.intro?.label, ...g.overlays.map((o) => o.label), g.outro?.label].filter((l): l is string => !!l)
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

export const renderReel: RenderFn = async (cuts, sources, opts) => {
    // Replay crops are drawn by the graphics session too: they make the render a graphics render even without any graphics.
    const crops = cropLabels(cuts)
    const g = opts.graphics ?? (crops.length > 0 ? { overlays: [] } : undefined)
    if (!hasGraphics(g) && crops.length === 0) return renderOnce(cuts, sources, opts, null)
    const report: GraphicsReport = { applied: [], skipped: [] }
    try {
        const out = await renderOnce(cuts, sources, opts, { graphics: g ?? { overlays: [] }, report })
        opts.onGraphics?.(report)
        return out
    } catch (e) {
        if (isAbort(e)) throw e
        // Graphics (and crops) must never cost the reel: render it again without them and say why.
        console.warn('Graphics failed, rendering without them', e)
        const out = await renderOnce(cuts.map(({ crop, cropLabel, ...c }) => { void crop; void cropLabel; return c }), sources, opts, null)
        opts.onGraphics?.({ applied: [], skipped: [...(g ? graphicLabels(g) : []), ...crops].map((label) => ({ label, reason: errorText(e) })) })
        return out
    }
}

type GraphicsRun = { graphics: RenderGraphics; report: GraphicsReport }

async function renderOnce(cuts: Cut[], sources: RenderSource[], opts: RenderOptions, run: GraphicsRun | null): Promise<File | Blob> {
    const { onProgress, signal } = opts
    const outputName = opts.outputName ?? OUTPUT_NAME
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
                skip([...graphicLabels(run.graphics), ...cropLabels(cuts)], errorText(e))
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
        // Plain stream-copy of several files: each key frame carries its own file's parameter sets and the sample entry
        // is the SPS that covers them all (a single set for the whole track mis-decodes every other file's footage).
        const usedList = [...used]
        const join: JoinPlan | null = !session && usedList.length > 1 ? planJoin(usedList.map((i) => opened[i].config.description), first.video.codec === 'hevc') : null
        const joinParams = new Map(usedList.map((i, k) => [opened[i], join?.params[k]] as const))
        const vConfig = session ? session.entry : join ? opened[usedList[join.entry]].config : first.config
        const aConfig = first.audio ? (await first.audio.getDecoderConfig())! : null
        const hasAudio = !!first.audio?.codec

        // Journaled (resumable) renders write every unit to its own log and mux at the end; others write the MP4 directly.
        let journal: { state: JobState } | null = null
        let startUnit = 0
        if (opts.resumable && await canJournal()) {
            const prev = await loadJob()
            const same = prev && prev.signature === opts.resumable.signature && prev.graphics === !!run && prev.unitCount === cuts.length + 2
            if (same && prev.unitsDone > 0) {
                journal = { state: prev }
                startUnit = prev.unitsDone
            } else {
                await discardJob()
                const state: JobState = {
                    kind: opts.resumable.kind, signature: opts.resumable.signature, outputName, graphics: !!run,
                    unitsDone: 0, unitCount: cuts.length + 2, cursor: 0, done: 0, total, copied: false, report: null,
                    video: vConfig, audio: aConfig, updatedAt: Date.now(),
                }
                await saveJob(state)
                journal = { state }
            }
        }

        // Cards are encoded before anything is written, so a failure just leaves the card out.
        const directIntro = journal ? null : await encodeCard(run?.graphics.intro, 'Title card')
        if (directIntro) done += cardSec(run?.graphics.intro)

        let direct: { output: Output; vOut: EncodedVideoPacketSource; aOut: EncodedAudioPacketSource | null; result: () => Promise<File | Blob>; discard: () => Promise<void> } | null = null
        if (!journal) {
            const { target, result, discard } = await makeTarget(outputName)
            const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
            const vOut = new EncodedVideoPacketSource(first.video.codec!)
            output.addVideoTrack(vOut)
            const aOut = hasAudio ? new EncodedAudioPacketSource(first.audio!.codec!) : null
            if (aOut) output.addAudioTrack(aOut)
            await output.start()
            direct = { output, vOut, aOut, result, discard }
        }
        let unitWriter: UnitWriter | null = null

        const vMeta = { decoderConfig: vConfig }
        const aMeta = aConfig ? { decoderConfig: aConfig } : undefined
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
        let cursor = journal?.state.cursor ?? 0
        if (journal && startUnit > 0) {
            done = journal.state.done
            if (run && journal.state.report) { run.report.applied.push(...journal.state.report.applied); run.report.skipped.push(...journal.state.report.skipped) }
        }
        let vFirst = true
        let aFirst = true
        let copied = journal?.state.copied ?? false
        const aOut = hasAudio // audio track present (direct or journaled)
        const addVideo = async (p: EncodedPacket): Promise<void> => {
            if (unitWriter) await unitWriter.write({ track: 0, key: p.type === 'key', timestamp: p.timestamp, duration: p.duration, data: p.data })
            else await direct!.vOut.add(p, vFirst ? vMeta : undefined)
            vFirst = false
        }
        const addAudio = async (p: EncodedPacket): Promise<void> => {
            if (unitWriter) await unitWriter.write({ track: 1, key: p.type === 'key', timestamp: p.timestamp, duration: p.duration, data: p.data })
            else await direct!.aOut!.add(p, aFirst ? aMeta : undefined)
            aFirst = false
        }
        const addCard = async (packets: EncodedPacket[]): Promise<void> => {
            for (const p of packets) await addVideo(p.clone({ timestamp: cursor + p.timestamp }))
            const length = packets.length * session!.frameSec
            if (aOut) for (const p of (await silencePackets(length)) ?? []) await addAudio(p.clone({ timestamp: cursor + p.timestamp }))
            cursor += length
        }

        const renderCut = async (ci: number, cut: Cut): Promise<void> => {
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
                return
            }

            const vSink = new EncodedPacketSink(src.video)
            const k0 = await vSink.getKeyPacket(cut.startSec) ?? await vSink.getFirstKeyPacket()
            if (!k0) return
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
            // Overlays tied to the cut follow its real extent (key frame before the requested start, whole GOPs).
            const realEnd = kStop ? kStop.timestamp : src.endSec
            let overlays = overlaysByCut.get(ci)?.map((o): RenderOverlay => {
                const length = Math.max(1e-3, realEnd - cutStart)
                if (o.anchor === 'fromCutStart') return { ...o, startSec: cutStart }
                if (o.anchor === 'wholeCut') {
                    const shift = cutStart - o.startSec
                    return { ...o, startSec: cutStart, durationSec: length + 1, paint: (ctx, t) => o.paint(ctx, t + shift) }
                }
                if (o.anchor === 'stretchToCut') {
                    const k = o.durationSec / length
                    return { ...o, startSec: cutStart, durationSec: length + 1, paint: (ctx, t) => o.paint(ctx, Math.min(o.durationSec, t * k)) }
                }
                return o
            })
            if (session && cut.crop) overlays = [...(overlays ?? []), cropOverlayFor(cut, ci, cutStart, realEnd)]
            if (session && overlays) {
                // Overlays: the cut is streamed; only the stretches around overlay windows are read into memory,
                // their GOPs re-encoded with the overlay drawn in, and handed on (see overlayRegions).
                const keyTimes: number[] = []
                for (let k: EncodedPacket | null = k0; k && (!kStop || k.timestamp < kStop.timestamp); k = await vSink.getNextKeyPacket(k, { metadataOnly: true })) {
                    keyTimes.push(k.timestamp)
                }
                const regions = overlayRegions(keyTimes, overlays.map((o): [number, number] => [o.startSec, o.startSec + o.durationSec]))
                const sess = session
                const report = run!.report
                async function* drawn(buf: EncodedPacket[]): AsyncGenerator<OutItem> {
                    const start = buf.reduce((m, p) => Math.min(m, p.timestamp), Infinity)
                    const end = buf.reduce((m, p) => Math.max(m, p.timestamp + p.duration), cutStart)
                    const mine = overlays!.filter((o) => o.startSec < end && o.startSec + o.durationSec > start)
                    if (mine.length === 0) { for (const p of buf) yield { packet: p, generated: false, splice: false }; return }
                    onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: Math.min(1, (done + Math.max(0, start - cut.startSec)) / total), stage: 'Graphics' })
                    const r = await sess.overlayCut(src, buf, end, mine)
                    report.applied.push(...r.applied)
                    report.skipped.push(...r.skipped)
                    yield* r.items
                }
                items = (async function* () {
                    let buf: EncodedPacket[] | null = null
                    let stopAt = Infinity
                    let ri = 0
                    for await (const p of copiedPackets()) {
                        if (p.type === 'key') {
                            if (buf && p.timestamp >= stopAt) { yield* drawn(buf); buf = null }
                            if (!buf) {
                                while (ri < regions.length && regions[ri][1] <= p.timestamp) ri++
                                if (ri < regions.length && regions[ri][0] <= p.timestamp) { buf = []; stopAt = regions[ri][1]; ri++ }
                            }
                        }
                        if (buf) buf.push(p)
                        else yield { packet: p, generated: false, splice: false }
                    }
                    if (buf) yield* drawn(buf)
                })()
                // Every overlay of this cut is either drawn or reported by overlayCut; none may vanish silently.
                const covered = (o: RenderOverlay): boolean => regions.some(([a, b]) => o.startSec + o.durationSec > a && o.startSec < b)
                skip(overlays.filter((o) => !covered(o)).map((o) => o.label), 'its window is outside the clip')
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
                    else {
                        if (spliceHere) data = blaAtCutStart(src, p) ?? data
                        const params = joinParams.get(src)
                        if (params && !hasInbandParams(data, src.video.codec === 'hevc', src.nalLength)) data = withInbandParams(data, params, src.video.codec === 'hevc', src.nalLength)
                    }
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

        try {
            // Units: 0 = title card, 1…n = cuts, n+1 = full-time card. Journaled renders save each finished unit.
            const unitCount = cuts.length + 2
            for (let u = startUnit; u < unitCount; u++) {
                if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError')
                if (journal) unitWriter = await openUnit(u)
                if (u === 0) {
                    const intro = journal ? await encodeCard(run?.graphics.intro, 'Title card') : directIntro
                    if (intro) {
                        if (journal) done += cardSec(run?.graphics.intro)
                        await addCard(intro)
                    }
                } else if (u <= cuts.length) {
                    await renderCut(u - 1, cuts[u - 1])
                } else {
                    if (!copied) throw new Error('Nothing to render: every cut is outside its file')
                    const outro = await encodeCard(run?.graphics.outro, 'Full-time card')
                    if (outro) await addCard(outro)
                }
                if (journal && unitWriter) {
                    await unitWriter.close()
                    unitWriter = null
                    await saveJob({ ...journal.state, unitsDone: u + 1, cursor, done, total, copied, report: run ? structuredClone(run.report) : null })
                }
            }
            if (journal) {
                onProgress({ cutIndex: cuts.length - 1, cutCount: cuts.length, fraction: 1, stage: 'Saving' })
                const file = await muxUnits(journal.state.outputName, unitCount, first, journal.state.video!, journal.state.audio, signal)
                await discardJob()
                return file
            }
            await direct!.output.finalize()
            return await direct!.result()
        } catch (e) {
            await unitWriter?.abort()
            if (direct) {
                await direct.output.cancel().catch(() => undefined)
                await direct.discard()
            }
            // A cancelled render is forgotten; anything else (a frozen tab, a failure) can be resumed.
            if (journal && isAbort(e)) await discardJob()
            throw e
        }
    } finally {
        for (const s of opened) s?.input.dispose()
    }
}
