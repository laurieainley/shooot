// Browser glue for the Media Source player: feeds a <video> small remuxed pieces of a File instead of the whole
// file as a blob URL, so memory stays bounded for multi-GB footage. The decisions live in msePlan.ts.
//
// Two SourceBuffers (video, audio), not one muxed one: each piece is cut per track by keyframe/packet boundaries,
// so the two tracks never need interleaving, a buffer's appends can be retried or evicted on their own, and a
// small audio/video edge mismatch cannot stall the muxed parser. Both are always appended together per piece.
import {
    AHEAD_SEC, FIRST_SEGMENT_SEC, LatestWins, METADATA_TIMEOUT_MS, SEGMENT_SEC, intersectRanges, mergeSpans, planEviction,
    planNext, planQuotaEviction, reconcileSpans, type Backend, type Span,
} from './msePlan'
import { buildSegment, openMseSource, type MseSource, type SegmentBytes } from './mseSegment'

export type MseBackend = Exclude<Backend, 'blob'>

export type AttachOptions = {
    backend: MseBackend
    /** Points the player at the MediaSource's object URL. */
    setSource: (url: string) => void
    /** Called once if anything goes wrong after a successful attach (append/decode error, no metadata in time). */
    onFailure: (reason: string) => void
    log?: (message: string) => void
    metadataTimeoutMs?: number
}

export type MseHandle = { backend: MseBackend; dispose: () => void }
export type AttachResult = { ok: true; handle: MseHandle } | { ok: false; reason: string }

type MediaSourceLike = MediaSource & { streaming?: boolean }
type Ctor = { new (): MediaSourceLike; isTypeSupported(type: string): boolean }

export function mediaSourceCtor(backend: MseBackend): Ctor | null {
    const w = globalThis as unknown as { ManagedMediaSource?: Ctor; MediaSource?: Ctor }
    return (backend === 'managed-mse' ? w.ManagedMediaSource : w.MediaSource) ?? null
}

export function mseAvailability(): { hasMediaSource: boolean; hasManagedMediaSource: boolean } {
    const w = globalThis as unknown as { ManagedMediaSource?: unknown; MediaSource?: unknown }
    return { hasMediaSource: typeof w.MediaSource === 'function', hasManagedMediaSource: typeof w.ManagedMediaSource === 'function' }
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'
const isQuota = (e: unknown): boolean => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)

const rangesOf = (t: TimeRanges, base: number): Span[] => {
    const out: Span[] = []
    for (let i = 0; i < t.length; i++) out.push({ start: t.start(i) + base, end: t.end(i) + base })
    return out
}

function whenIdle(sb: SourceBuffer): Promise<void> {
    if (!sb.updating) return Promise.resolve()
    return new Promise((resolve) => sb.addEventListener('updateend', () => resolve(), { once: true }))
}

/** Runs one SourceBuffer operation and resolves at its `updateend` (rejects on `error`). */
async function run(sb: SourceBuffer, op: () => void): Promise<void> {
    await whenIdle(sb)
    await new Promise<void>((resolve, reject) => {
        const onEnd = (): void => { cleanup(); resolve() }
        const onErr = (): void => { cleanup(); reject(new Error('SourceBuffer error')) }
        const cleanup = (): void => { sb.removeEventListener('updateend', onEnd); sb.removeEventListener('error', onErr) }
        sb.addEventListener('updateend', onEnd)
        sb.addEventListener('error', onErr)
        try { op() } catch (e) { cleanup(); reject(e) }
    })
}

const join = (a: SegmentBytes, withInit: boolean): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(withInit ? a.init.length + a.media.length : a.media.length)
    if (withInit) out.set(a.init, 0)
    out.set(a.media, withInit ? a.init.length : 0)
    return out
}

/**
 * Opens `file`, creates the MediaSource and hands its URL to `setSource`. Resolves when the SourceBuffers exist
 * (the first pieces then load in the background). A failure before that is returned; later ones go to `onFailure`.
 */
export async function attachMse(video: HTMLVideoElement, file: File, opts: AttachOptions): Promise<AttachResult> {
    const log = opts.log ?? (() => undefined)
    const Ctor = mediaSourceCtor(opts.backend)
    if (!Ctor) return { ok: false, reason: 'no MediaSource in this browser' }
    const opened = await openMseSource(file)
    if (!opened.ok) return { ok: false, reason: opened.reason }
    const src: MseSource = opened.source
    for (const mime of [src.videoMime, src.audioMime]) {
        if (mime && !Ctor.isTypeSupported(mime)) { src.dispose(); return { ok: false, reason: `codec not supported: ${mime}` } }
    }

    const ms = new Ctor()
    const base = src.base
    const endSrc = src.endSec
    let disposed = false
    let failed = false
    let ready = false
    let url: string | null = null
    let videoSb: SourceBuffer
    let audioSb: SourceBuffer | null = null
    let spans: Span[] = []
    let lastEnd: number | null = null
    let running = false
    let rerun = false
    let inflight: { from: number; span: number; abort: AbortController } | null = null
    const seeks = new LatestWins<number>()
    let timer: ReturnType<typeof setTimeout> | null = null
    let settle: (r: AttachResult) => void = () => undefined
    const result = new Promise<AttachResult>((resolve) => { settle = resolve })

    const nowSrc = (): number => video.currentTime + base
    const fail = (reason: string): void => {
        if (failed || disposed) return
        failed = true
        log(`mse failed: ${reason}`)
        if (ready) opts.onFailure(reason)
        else settle({ ok: false, reason })
    }

    const buffers = (): SourceBuffer[] => (audioSb ? [videoSb, audioSb] : [videoSb])
    const bufferedSrc = (): Span[] => buffers().map((sb) => rangesOf(sb.buffered, base)).reduce((a, b) => intersectRanges(a, b))

    const removeSpan = async (s: Span): Promise<void> => {
        spans = spans.filter((x) => x !== s)
        for (const sb of buffers()) {
            if (ms.readyState === 'closed') return
            await run(sb, () => sb.remove(Math.max(0, s.start - base), s.end - base))
        }
    }

    const appendEvicting = async (sb: SourceBuffer, data: Uint8Array<ArrayBuffer>): Promise<void> => {
        for (let attempt = 0; ; attempt++) {
            try { await run(sb, () => sb.appendBuffer(data)); return } catch (e) {
                const victim = isQuota(e) && attempt < 8 ? planQuotaEviction(nowSrc(), spans) : null
                if (!victim) throw e
                log(`quota: evicting ${victim.start.toFixed(1)}-${victim.end.toFixed(1)}`)
                await removeSpan(victim)
            }
        }
    }

    const maybeEnd = async (): Promise<void> => {
        const last = mergeSpans(spans).at(-1)
        if (!last || last.end < endSrc - 1e-3 || ms.readyState !== 'open') return
        for (const sb of buffers()) await whenIdle(sb)
        if (ms.readyState === 'open') { try { ms.endOfStream() } catch { /* a buffer is busy; the next pass retries */ } }
    }

    async function pumpLoop(): Promise<void> {
        while (!disposed && !failed) {
            if (ms.readyState === 'closed') return
            if (opts.backend === 'managed-mse' && ms.streaming === false) return
            spans = reconcileSpans(spans, bufferedSrc())
            const t = seeks.take() ?? nowSrc()
            for (const s of planEviction(t, spans)) await removeSpan(s)
            const plan = planNext(t, spans, endSrc, AHEAD_SEC)
            if (!plan) { await maybeEnd(); return }
            const jump = plan.from === t
            const targetSec = jump ? FIRST_SEGMENT_SEC : SEGMENT_SEC
            const abort = new AbortController()
            inflight = { from: plan.from, span: targetSec, abort }
            let seg
            try { seg = await buildSegment(src, plan.from, targetSec, abort.signal) } catch (e) {
                if (isAbort(e)) continue
                throw e
            } finally { inflight = null }
            if (abort.signal.aborted || disposed) continue
            const withInit = lastEnd === null || Math.abs(seg.start - lastEnd) > 1e-3
            await appendEvicting(videoSb, join(seg.video, withInit))
            if (audioSb && seg.audio) await appendEvicting(audioSb, join(seg.audio, withInit))
            spans.push({ start: seg.start, end: seg.end })
            lastEnd = seg.end
        }
    }

    async function pump(): Promise<void> {
        if (!ready || disposed || failed) return
        if (running) { rerun = true; return }
        running = true
        try {
            do { rerun = false; await pumpLoop() } while (rerun && !disposed && !failed)
        } catch (e) {
            if (!isAbort(e)) fail(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
        } finally { running = false }
    }

    const onSeeking = (): void => {
        const t = nowSrc()
        seeks.push(t)
        const covered = spans.some((s) => s.start <= t + 0.05 && s.end > t)
        const fetching = inflight && t >= inflight.from - 0.05 && t < inflight.from + inflight.span
        if (!covered && !fetching) inflight?.abort.abort()
        void pump()
    }
    const onWake = (): void => { void pump() }
    const onError = (): void => fail(`video error ${video.error?.code ?? '?'}${video.error?.message ? `: ${video.error.message}` : ''}`)
    const onMeta = (): void => { if (timer) { clearTimeout(timer); timer = null } }

    const dispose = (): void => {
        if (disposed) return
        disposed = true
        if (timer) clearTimeout(timer)
        inflight?.abort.abort()
        video.removeEventListener('seeking', onSeeking)
        video.removeEventListener('timeupdate', onWake)
        video.removeEventListener('waiting', onWake)
        video.removeEventListener('loadedmetadata', onMeta)
        video.removeEventListener('error', onError)
        ms.removeEventListener('startstreaming', onWake)
        ms.removeEventListener('sourceopen', onOpen)
        if (url) URL.revokeObjectURL(url)
        // Let any running pass finish its current step against the closing source before the input goes away.
        void (async () => { while (running) await new Promise((r) => setTimeout(r, 20)); src.dispose() })()
    }

    function onOpen(): void {
        if (ready || disposed) return
        try {
            ms.duration = Math.max(0, endSrc - base)
            videoSb = ms.addSourceBuffer(src.videoMime)
            videoSb.timestampOffset = -base
            if (src.audioMime) { audioSb = ms.addSourceBuffer(src.audioMime); audioSb.timestampOffset = -base }
        } catch (e) { fail(`MediaSource setup: ${e instanceof Error ? e.message : String(e)}`); return }
        ready = true
        for (const sb of buffers()) sb.addEventListener('error', () => fail('SourceBuffer error'))
        video.addEventListener('seeking', onSeeking)
        video.addEventListener('timeupdate', onWake)
        video.addEventListener('waiting', onWake)
        video.addEventListener('error', onError)
        ms.addEventListener('startstreaming', onWake)
        settle({ ok: true, handle: { backend: opts.backend, dispose } })
        void pump()
    }

    ms.addEventListener('sourceopen', onOpen)
    video.addEventListener('loadedmetadata', onMeta)
    if (opts.backend === 'managed-mse') video.disableRemotePlayback = true
    url = URL.createObjectURL(ms)
    timer = setTimeout(() => fail(`no loadedmetadata in ${(opts.metadataTimeoutMs ?? METADATA_TIMEOUT_MS) / 1000} s`), opts.metadataTimeoutMs ?? METADATA_TIMEOUT_MS)
    opts.setSource(url)
    const r = await result
    if (!r.ok) dispose()
    return r
}
