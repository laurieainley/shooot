import {
    EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink,
    EncodedVideoPacketSource, Mp4OutputFormat, Output,
} from 'mediabunny'
import { openSource, makeTarget, type OpenSource } from './sourceInput'
import { muxUnits } from './muxUnits'
import { renderTranscoded } from './transcodeEngine'
import { RenderDiagnostics, describeParams, errorInfo, publishReport } from './diagnostics'
import { isStorageFull } from './storage'
import { cropLabels, cropOverlayFor } from './cropOverlay'
import { openGraphicsSession, type GraphicsSession, type OutItem } from './graphicsSession'
import { hasInbandParams, joinEntryConfig, planJoin, profileOf, type JoinPlan } from './joinParams'
import { craToBla, withInbandParams } from './nal'
import { clipPartSeconds, replayPartAfter } from './captionJoin'
import { planAudio } from './audioPlan'
import { cutTiming } from '../utils/chapterTimes'
import { mixedSizeNotice } from './outputSize'
import { overlayRegions } from './overlayRegions'
import { DEFAULT_COEF, WorkMeter, cutShare, detectDeviceClass, factsOfSource, planWork, priceUnits, ZERO_UNITS } from '../utils/renderTime'
import { tightenOverlays } from './tightOverlays'
import { encodeReplayAudio } from './replayAudio'
import { makeSilentAudio, type SilentAudio } from './silentAudio'
import { canJournal, discardJob, loadJob, openUnit, saveJob, type JobState, type UnitWriter } from './renderJob'
import type { Cut, CutTiming, GraphicsReport, RenderCard, RenderFn, RenderGraphics, RenderOptions, RenderOverlay, RenderSource } from './types'

const OUTPUT_NAME = 'highlights.mp4'

function blaAtCutStart(src: OpenSource, p: EncodedPacket): Uint8Array | null {
    return p.type === 'key' && src.video.codec === 'hevc' && src.config.description ? craToBla(p.data, src.nalLength) : null
}

function assertCompatible(sources: OpenSource[], used: Set<number>): void {
    const vc = new Set([...used].map((i) => sources[i].video.codec))
    const vp = new Set([...used].map((i) => `${sources[i].video.codec}/${profileOf(sources[i].config.codec)}`))
    if (vc.size === 1 && vp.size > 1) throw new Error('Clips use different video profiles (e.g. 8-bit and 10-bit) and cannot be joined without re-encoding')
    if (vc.size > 1) throw new Error('Clips use different video codecs (e.g. HEVC and H.264) and cannot be joined without re-encoding')
    // Clips without an audio track are fine (they get silence); the ones with audio must agree.
    if (!planAudio([...used].map((i) => sources[i].audio)).ok) throw new Error('Clips use different audio formats and cannot be joined without re-encoding')
}

/** Diagnostics only: what this source file is, as the browser and Mediabunny see it. Never fails the render. */
async function recordSource(diag: RenderDiagnostics, index: number, src: RenderSource, o: OpenSource): Promise<void> {
    try {
        const cs = o.config.colorSpace
        let frameRate: number | null = null
        try { frameRate = (await o.video.computePacketStats(90)).averagePacketRate } catch { /* unknown */ }
        diag.source({
            index, name: src.name, sizeBytes: src.file.size, videoCodec: o.video.codec, codec: o.config.codec, description: o.config.description,
            codedWidth: o.video.codedWidth, codedHeight: o.video.codedHeight, displayWidth: o.video.displayWidth, displayHeight: o.video.displayHeight,
            frameRate, colorSpace: cs ? { primaries: cs.primaries, transfer: cs.transfer, matrix: cs.matrix, fullRange: cs.fullRange } : null,
        })
    } catch (e) {
        diag.note(`Could not describe source #${index}: ${errorInfo(e).message}`)
    }
}

const hasGraphics = (g: RenderGraphics | undefined): g is RenderGraphics => !!g && (!!g.intro || !!g.outro || g.overlays.length > 0)
const graphicLabels = (g: RenderGraphics): string[] => [g.intro?.label, ...g.overlays.map((o) => o.label), g.outro?.label].filter((l): l is string => !!l)
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

export const renderReel: RenderFn = async (cuts, sources, opts) => {
    const diag = new RenderDiagnostics({ kind: opts.resumable?.kind ?? opts.kind ?? 'highlights', outputName: opts.outputName ?? OUTPUT_NAME, ...(opts.wakeLockStatus ? { wakeLock: opts.wakeLockStatus } : {}) })
    const endTotal = diag.begin('total')
    try {
        const out = opts.output ? await renderTranscoded(cuts, sources, opts, diag) : await renderGraphicsFirst(cuts, sources, opts, diag)
        endTotal()
        publishReport(diag.report('done'), { onReport: opts.onDiagnostics })
        return out
    } catch (e) {
        endTotal()
        publishReport(diag.report(isAbort(e) ? 'cancelled' : 'failed', e), { onReport: opts.onDiagnostics })
        throw e
    }
}

async function renderGraphicsFirst(cuts: Cut[], sources: RenderSource[], opts: RenderOptions, diag: RenderDiagnostics): Promise<File | Blob> {
    // Replay crops are drawn by the graphics session too: they make the render a graphics render even without any graphics.
    const crops = cropLabels(cuts)
    const g = opts.graphics ?? (crops.length > 0 ? { overlays: [] } : undefined)
    if (!hasGraphics(g) && crops.length === 0) return renderOnce(cuts, sources, opts, null, diag)
    const report: GraphicsReport = { applied: [], skipped: [] }
    try {
        const out = await renderOnce(cuts, sources, opts, { graphics: g ?? { overlays: [] }, report }, diag)
        opts.onGraphics?.(report)
        return out
    } catch (e) {
        if (isAbort(e)) throw e
        // Out of storage is not a graphics problem: rendering again without them would fail the same way.
        if (isStorageFull(e)) throw e
        // Graphics (and crops) must never cost the reel: render it again without them and say why.
        console.warn('Graphics failed, rendering without them', e)
        diag.note('Graphics failed: the reel was rendered again without them')
        diag.clearApplied()
        for (const label of [...(g ? graphicLabels(g) : []), ...crops]) diag.graphicSkipped(label, errorText(e), e)
        const out = await renderOnce(cuts.map(({ crop, cropLabel, ...c }) => { void crop; void cropLabel; return c }), sources, opts, null, diag)
        opts.onGraphics?.({ applied: [], skipped: [...(g ? graphicLabels(g) : []), ...crops].map((label) => ({ label, reason: errorText(e) })) })
        return out
    }
}

type GraphicsRun = { graphics: RenderGraphics; report: GraphicsReport }

async function renderOnce(cuts: Cut[], sources: RenderSource[], opts: RenderOptions, runIn: GraphicsRun | null, diag: RenderDiagnostics): Promise<File | Blob> {
    let run = runIn
    const { onProgress, signal } = opts
    const outputName = opts.outputName ?? OUTPUT_NAME
    if (cuts.length === 0) throw new Error('Nothing to render')
    const used = new Set(cuts.map((c) => c.sourceIndex))
    const opened: OpenSource[] = []
    try {
        const endOpen = diag.begin('openSources')
        for (const [i, s] of sources.entries()) {
            if (used.has(i)) opened[i] = await openSource(s)
        }
        endOpen()
        for (const i of used) await recordSource(diag, i, sources[i], opened[i])
        assertCompatible(opened, used)

        const first = opened[cuts[0].sourceIndex]
        // Mixed frame sizes: the output is the first file's size, the others are re-encoded scaled to cover it, so a
        // graphics session is needed even without graphics. Ask first: this is slower than a copy.
        const odd = [...used].filter((i) => opened[i].video.codedWidth !== first.video.codedWidth || opened[i].video.codedHeight !== first.video.codedHeight)
        if (odd.length > 0) {
            run ??= { graphics: { overlays: [] }, report: { applied: [], skipped: [] } }
            const notice = mixedSizeNotice(odd.map((i) => ({
                name: sources[i].name, width: opened[i].video.codedWidth, height: opened[i].video.codedHeight,
                seconds: cuts.filter((c) => c.sourceIndex === i).reduce((a, c) => a + Math.max(0, Math.min(c.endSec, opened[i].endSec) - c.startSec), 0),
            })), first.video.codedWidth, first.video.codedHeight)
            if (opts.confirmMixedSizes && !(await opts.confirmMixedSizes(notice))) throw new DOMException('Render cancelled', 'AbortError')
        }
        const skip = (labels: string[], reason: string, error?: unknown): void => {
            run?.report.skipped.push(...labels.filter(Boolean).map((label) => ({ label, reason })))
            if (run) for (const label of labels) diag.graphicSkipped(label, reason, error)
        }
        diag.outputSize(first.video.codedWidth, first.video.codedHeight)

        // Graphics: one encoder for the reel, a sample entry that covers it and every clip, or none at all.
        let session: GraphicsSession | null = null
        if (run) {
            const endSession = diag.begin('graphicsSession')
            try {
                session = await openGraphicsSession([...used].map((i) => opened[i]), first, diag)
            } catch (e) {
                if (odd.length > 0) throw new Error(`Clips have different frame sizes and cannot be scaled in this browser: ${errorText(e)}`)
                skip([...graphicLabels(run.graphics), ...cropLabels(cuts)], errorText(e), e)
            }
            endSession()
        }
        const overlaysByCut = new Map<number, RenderOverlay[]>()
        for (const o of session ? run!.graphics.overlays : []) {
            if (!cuts[o.cutIndex]) { skip([o.label], 'its clip is not in the reel'); continue }
            overlaysByCut.set(o.cutIndex, [...(overlaysByCut.get(o.cutIndex) ?? []), o])
        }

        const cardSec = (c: RenderCard | undefined): number => (session && c ? c.durationSec : 0)
        // Progress is the share of estimated WORK done, not media time: a copied second and a re-encoded one differ 10-50x in cost
        // (utils/renderTime prices every cut and card with the same model the Export panel's hint uses).
        const fps = await first.video.computePacketStats(120).then((st) => st.averagePacketRate).catch(() => 30)
        const pricing = { facts: factsOfSource({ width: first.video.displayWidth, height: first.video.displayHeight, codec: first.video.codec, fps, bytes: sources[cuts[0].sourceIndex].file.size, seconds: first.endSec }), output: 'original' as const, coef: DEFAULT_COEF[detectDeviceClass()] }
        const work = planWork({
            cuts: cuts.map((c) => ({ ...c, endSec: Math.min(c.endSec, opened[c.sourceIndex].endSec) })),
            overlays: [...overlaysByCut.values()].flat().map((o) => ({ cutIndex: o.cutIndex, startSec: o.startSec, durationSec: o.durationSec, ...(o.anchor === 'wholeCut' || o.anchor === 'stretchToCut' ? { whole: true } : {}) })),
            introSec: cardSec(run?.graphics.intro), outroSec: cardSec(run?.graphics.outro),
        }, pricing)
        const total = work.seconds || 1
        const introWork = work.sections[0].seconds
        const cutWork = (ci: number): number => work.sections[ci + 1]?.seconds ?? 0
        const copyRate = priceUnits({ ...ZERO_UNITS, copySec: 1 }, pricing)
        const regionRate = priceUnits({ ...ZERO_UNITS, decSec: 1, encSec: 1, paintSec: 1 }, pricing)
        const meter = new WorkMeter(total)
        /** Fraction for `workDone` (model seconds), never going backwards. */
        const fractionAt = (workDone: number): number => { meter.set(workDone); return meter.fraction() }
        let done = 0
        onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: 0, stage: 'Starting', estimateSec: total })
        const spanStats: { outStart: number; outEnd: number; windowSec: number }[] = []
        const spanReport = (): void => opts.onStats?.({
            overlaySpans: spanStats.length, reencodedSourceSec: +spanStats.reduce((a, x) => a + x.outEnd - x.outStart, 0).toFixed(3),
            overlayWindowSec: +spanStats.reduce((a, x) => a + x.windowSec, 0).toFixed(3),
            spans: spanStats.map((x) => ({ fromSec: +x.outStart.toFixed(2), toSec: +x.outEnd.toFixed(2), windowSec: +x.windowSec.toFixed(2) })),
        })

        // Cards are encoded before anything is written, so a failure just leaves the card out.
        const encodeCard = async (card: RenderCard | undefined, stage: string): Promise<EncodedPacket[] | null> => {
            if (!session || !card) return null
            const endCard = diag.begin('cards')
            try {
                const cardW = card === run?.graphics.intro ? introWork : work.sections[work.sections.length - 1].seconds
                const packets = await session.card(card, (f) => onProgress({ cutIndex: 0, cutCount: cuts.length, fraction: fractionAt(done + f * cardW), stage }))
                run!.report.applied.push(card.label)
                diag.graphicApplied(card.label)
                return packets
            } catch (e) {
                skip([card.label], errorText(e), e)
                return null
            } finally {
                endCard()
            }
        }
        // Plain stream-copy of several files: each key frame carries its own file's parameter sets and the sample entry
        // is the SPS that covers them all (a single set for the whole track mis-decodes every other file's footage).
        const usedList = [...used]
        const join: JoinPlan | null = !session && usedList.length > 1 ? planJoin(usedList.map((i) => opened[i].config.description), first.video.codec === 'hevc') : null
        const joinParams = new Map(usedList.map((i, k) => [opened[i], join?.params[k]] as const))
        const vConfig = session ? session.entry : join ? joinEntryConfig(join, opened[usedList[join.entry]].config, first.video.codec === 'hevc') : first.config
        diag.sampleEntry({
            mode: session ? 'graphics' : join ? 'join' : 'copy', codec: vConfig.codec, params: describeParams(vConfig.description, first.video.codec === 'hevc'),
            ...(join ? { joinEntrySource: usedList[join.entry], joinLimits: join.limits } : {}),
        })
        // The reel's audio follows the first clip that has any; clips without audio get silence of their length.
        const cutSources = [...new Set(cuts.map((c) => c.sourceIndex))]
        const audioPlanned = planAudio(cutSources.map((i) => opened[i].audio))
        const audioSource = audioPlanned.ok && audioPlanned.reference !== null ? opened[cutSources[audioPlanned.reference]] : null
        const aConfig = audioSource?.audio ? (await audioSource.audio.getDecoderConfig())! : null
        const hasAudio = !!audioSource?.audio?.codec

        // Journaled (resumable) renders write every unit to its own log and mux at the end; others write the MP4 directly.
        let journal: { state: JobState } | null = null
        let startUnit = 0
        // Where every cut really landed in the output (reported at the end, for the YouTube chapters).
        let timings: (CutTiming | null)[] = cuts.map(() => null)
        let timingsKnown = true
        if (opts.resumable && await canJournal()) {
            const prev = await loadJob()
            const same = prev && prev.signature === opts.resumable.signature && prev.graphics === !!run && prev.unitCount === cuts.length + 2
            if (same && prev.unitsDone > 0) {
                journal = { state: prev }
                startUnit = prev.unitsDone
                if (prev.timings?.length === cuts.length) timings = prev.timings
                else timingsKnown = false // saved by an older version: the finished cuts' places are not known
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
        if (directIntro) done += introWork

        let direct: { output: Output; vOut: EncodedVideoPacketSource; aOut: EncodedAudioPacketSource | null; result: () => Promise<File | Blob>; discard: () => Promise<void> } | null = null
        if (!journal) {
            const { target, result, discard } = await makeTarget(outputName, opts.experiments?.targetFile)
            const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
            const vOut = new EncodedVideoPacketSource(first.video.codec!)
            output.addVideoTrack(vOut)
            const aOut = hasAudio ? new EncodedAudioPacketSource(audioSource!.audio!.codec!) : null
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
                silence = audioSource?.audio
                    ? await makeSilentAudio({ sampleRate: audioSource.audio.sampleRate, numberOfChannels: audioSource.audio.numberOfChannels }).catch(() => null)
                    : null
                if (!silence) console.warn('Replay audio: no AAC encoder, leaving a gap')
            }
            return silence ? silence.packets(durationSec) : null
        }
        let cursor = journal?.state.cursor ?? 0
        if (journal && startUnit > 0) {
            done = (journal.state.done / (journal.state.total || 1)) * total // saved as a share of the work, whatever the units
            if (run && journal.state.report) {
                run.report.applied.push(...journal.state.report.applied); run.report.skipped.push(...journal.state.report.skipped)
                for (const l of journal.state.report.applied) diag.graphicApplied(l)
                for (const g of journal.state.report.skipped) diag.graphicSkipped(g.label, g.reason)
            }
            diag.note(`Resumed after unit ${startUnit}: earlier graphics outcomes come from the saved progress (no stack traces)`)
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

        // Real extent of a cut (key frame before its start, whole GOPs), for overlays that follow it across a join.
        const extentOf = async (ci: number): Promise<{ cutStart: number; realEnd: number } | null> => {
            const c = cuts[ci]
            const s = opened[c.sourceIndex]
            const sink = new EncodedPacketSink(s.video)
            const k = await sink.getKeyPacket(c.startSec) ?? await sink.getFirstKeyPacket()
            if (!k) return null
            const kEnd = await sink.getKeyPacket(Math.min(c.endSec, s.endSec))
            const stop = kEnd && kEnd.timestamp > k.timestamp ? await sink.getNextKeyPacket(kEnd) : await sink.getNextKeyPacket(k)
            return { cutStart: k.timestamp, realEnd: stop ? stop.timestamp : s.endSec }
        }
        /** How much of a carried-on caption its clip part shows: up to the clip's real end. */
        const clipShown = async (o: RenderOverlay, ci: number): Promise<number> => {
            const ext = await extentOf(ci)
            return clipPartSeconds(o.startSec, o.durationSec, ext?.realEnd ?? o.startSec + o.durationSec, o.follows?.totalSec ?? 5)
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
            // Where this cut is in its work: copying is cheap, the re-encoded regions around graphics are not.
            let workRegions: [number, number][] = []
            const share = (t: number): number => cutShare(t, cutStart, realEnd, workRegions, copyRate, regionRate)
            const planned = overlaysByCut.get(ci)
            let overlays: RenderOverlay[] | undefined
            if (planned) {
                overlays = []
                for (const o of planned) {
                    const length = Math.max(1e-3, realEnd - cutStart)
                    if (o.anchor === 'fromCutStart') {
                        // The replay part of a caption carried on from the clip: it continues from where the clip part really ended.
                        const prev = o.follows ? overlaysByCut.get(ci - 1)?.find((x) => x.anchor === 'toCutEnd' && x.label === o.label) : undefined
                        if (o.follows && prev) {
                            const after = replayPartAfter({ shownSec: await clipShown({ ...prev, follows: o.follows }, ci - 1), plannedOffsetSec: o.follows.offsetSec, totalSec: o.follows.totalSec, rate: o.follows.rate, replaySec: length })
                            if (after) overlays.push({ ...o, startSec: cutStart, durationSec: after.durationSec, paint: (ctx, t) => o.paint(ctx, t + after.paintShiftSec) })
                            continue
                        }
                        overlays.push({ ...o, startSec: cutStart })
                    } else if (o.anchor === 'toCutEnd') {
                        overlays.push({ ...o, durationSec: await clipShown(o, ci) })
                    } else if (o.anchor === 'wholeCut') {
                        const shift = cutStart - o.startSec
                        overlays.push({ ...o, startSec: cutStart, durationSec: length + 1, paint: (ctx, t) => o.paint(ctx, t + shift) })
                    } else if (o.anchor === 'stretchToCut') {
                        const k = o.durationSec / length
                        overlays.push({ ...o, startSec: cutStart, durationSec: length + 1, paint: (ctx, t) => o.paint(ctx, Math.min(o.durationSec, t * k)) })
                    } else overlays.push(o)
                }
            }
            if (opts.experiments?.tightSpans && overlays) overlays = tightenOverlays(overlays) // experiment 6
            if (session && cut.crop) overlays = [...(overlays ?? []), cropOverlayFor(cut, ci, cutStart, realEnd)]
            // Footage of another frame size: every picture is re-encoded (the whole cut is one window that draws nothing).
            const rescale = !!session && session.rescales(src)
            if (rescale) overlays = [...(overlays ?? []), { label: '', cutIndex: ci, startSec: cutStart, durationSec: Math.max(1e-3, realEnd - cutStart) + 1, paint: () => undefined, rows: () => [0, 0] }]
            if (session && overlays) {
                // Overlays: the cut is streamed; only the stretches around overlay windows are read into memory,
                // their GOPs re-encoded with the overlay drawn in, and handed on (see overlayRegions).
                const keyTimes: number[] = []
                for (let k: EncodedPacket | null = k0; k && (!kStop || k.timestamp < kStop.timestamp); k = await vSink.getNextKeyPacket(k, { metadataOnly: true })) {
                    keyTimes.push(k.timestamp)
                }
                const regions = overlayRegions(keyTimes, overlays.map((o): [number, number] => [o.startSec, o.startSec + o.durationSec]))
                workRegions = regions
                const sess = session
                const report = run!.report
                async function* drawn(buf: EncodedPacket[]): AsyncGenerator<OutItem> {
                    const start = buf.reduce((m, p) => Math.min(m, p.timestamp), Infinity)
                    const end = buf.reduce((m, p) => Math.max(m, p.timestamp + p.duration), cutStart)
                    const mine = overlays!.filter((o) => o.startSec < end && o.startSec + o.durationSec > start)
                    if (mine.length === 0) { for (const p of buf) yield { packet: p, generated: false, splice: false }; return }
                    onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: fractionAt(done + cutWork(ci) * share(start)), stage: 'Graphics' })
                    const r = await sess.overlayCut(src, buf, end, mine, opts.onStats ? (s) => spanStats.push(s) : undefined)
                    // Scaled footage must not be copied unscaled into a file of another size: that is a failure.
                    if (rescale && r.skipped.length > 0) throw new Error(`${sources[cut.sourceIndex].name}: ${r.skipped[0].reason}`)
                    report.applied.push(...r.applied.filter(Boolean))
                    report.skipped.push(...r.skipped.filter((g) => g.label))
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
                onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: fractionAt(done + cutWork(ci) * share(p.timestamp)) })
            }

            // End at the last copied frame (equals kStop for closed GOPs; open GOPs lose
            // the next key packet's leading pictures, so don't leave a hole for them).
            const cutEnd = videoEnd > cutStart ? videoEnd : (kStop ? kStop.timestamp : src.endSec)

            const outSpan = (cutEnd - cutStart) / speed
            if (cut.silent || reencode || !src.audio) {
                if (aOut) {
                    let packets: EncodedPacket[] | null = null
                    if (reencode && src.audio) {
                        packets = await encodeReplayAudio(src.audio, { startSec: cutStart, endSec: cutEnd, speed, gain, outDurationSec: outSpan })
                            .catch((e: unknown) => { console.warn('Replay audio: re-encoding failed, using silence', e); return null })
                    }
                    // Never full-volume (or unscaled) audio under a replay: when it can't be re-encoded it is silent.
                    if (!packets && reencode && src.audio) diag.note(`Replay audio at ${cutStart.toFixed(1)} s of source #${cut.sourceIndex} could not be re-encoded at half volume: replaced by silence`)
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
            timings[ci] = cutTiming(cursor, cutStart, cutEnd, speed)
            cursor += outSpan
            done += cutWork(ci)
            onProgress({ cutIndex: ci, cutCount: cuts.length, fraction: fractionAt(done) })
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
                        if (journal) done += introWork
                        await addCard(intro)
                    }
                } else if (u <= cuts.length) {
                    const endCut = diag.begin('cuts')
                    try { await renderCut(u - 1, cuts[u - 1]) } finally { endCut() }
                } else {
                    if (!copied) throw new Error('Nothing to render: every cut is outside its file')
                    const outro = await encodeCard(run?.graphics.outro, run?.graphics.outro?.label ?? 'Full-time card')
                    if (outro) await addCard(outro)
                }
                if (journal && unitWriter) {
                    await unitWriter.close()
                    unitWriter = null
                    await saveJob({ ...journal.state, unitsDone: u + 1, cursor, done, total, copied, timings, report: run ? structuredClone(run.report) : null })
                }
            }
            if (journal) {
                onProgress({ cutIndex: cuts.length - 1, cutCount: cuts.length, fraction: 1, stage: 'Saving' })
                const endMux = diag.begin('finalize')
                const file = await muxUnits(journal.state.outputName, unitCount, first.video.codec!, audioSource?.audio?.codec ?? null, journal.state.video!, journal.state.audio, signal, opts.experiments?.targetFile)
                await discardJob()
                endMux()
                if (timingsKnown) opts.onTimeline?.(timings)
                spanReport()
                return file
            }
            const endFin = diag.begin('finalize')
            await direct!.output.finalize()
            const file = await direct!.result()
            endFin()
            if (timingsKnown) opts.onTimeline?.(timings)
            spanReport()
            return file
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
