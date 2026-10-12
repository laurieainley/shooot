// Experiment 3 (estimate): render one goal clip and its replay while the source plays in a visible <video>.
// Measures the render time with and without playback, and how smoothly the video plays with and without the render.
import { prepareSpec } from '../../graphics/prepare'
import { bitrateFor, highlightsPlan, pair, run, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

export type PlaybackStats = { seconds: number; frames: number; dropped: number; totalReported: number; meanIntervalMs: number; jitterMs: number; maxIntervalMs: number; lateFrames: number; mediaAdvanceSec: number }

const once = (el: HTMLVideoElement, ok: string, bad = 'error', ms = 20000): Promise<void> =>
    new Promise((resolve, reject) => {
        const t = setTimeout(() => { cleanup(); reject(new Error(`video did not reach '${ok}' in ${ms / 1000} s`)) }, ms)
        const good = (): void => { cleanup(); resolve() }
        const fail = (): void => { cleanup(); reject(new Error(`video error ${el.error?.code ?? ''} ${el.error?.message ?? ''}`.trim())) }
        const cleanup = (): void => { clearTimeout(t); el.removeEventListener(ok, good); el.removeEventListener(bad, fail) }
        el.addEventListener(ok, good)
        el.addEventListener(bad, fail)
    })

/** Plays for as long as `during` runs (at least `minSec`), counting presented frames with requestVideoFrameCallback. */
async function playWhile(video: HTMLVideoElement, startSec: number, minSec: number, during: (() => Promise<unknown>) | null): Promise<PlaybackStats> {
    video.currentTime = startSec
    await once(video, 'seeked', 'error', 10000).catch(() => undefined)
    const q0 = video.getVideoPlaybackQuality?.()
    const times: number[] = []
    const media: number[] = []
    let live = true
    const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, md: { mediaTime: number }) => void) => number }).requestVideoFrameCallback?.bind(video)
    const tick = (now: number, md: { mediaTime: number }): void => {
        times.push(now)
        media.push(md.mediaTime)
        if (live) rvfc?.(tick)
    }
    rvfc?.(tick)
    const t0 = performance.now()
    await video.play()
    if (during) await during()
    const rest = minSec * 1000 - (performance.now() - t0)
    if (rest > 0) await new Promise((r) => setTimeout(r, rest))
    live = false
    video.pause()
    const seconds = (performance.now() - t0) / 1000
    const q1 = video.getVideoPlaybackQuality?.()
    const gaps = times.slice(1).map((t, i) => t - times[i])
    const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
    const sd = gaps.length ? Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) : 0
    const sorted = [...gaps].sort((a, b) => a - b)
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
    return {
        seconds: +seconds.toFixed(1), frames: times.length, dropped: (q1?.droppedVideoFrames ?? 0) - (q0?.droppedVideoFrames ?? 0),
        totalReported: (q1?.totalVideoFrames ?? 0) - (q0?.totalVideoFrames ?? 0), meanIntervalMs: +mean.toFixed(2), jitterMs: +sd.toFixed(2),
        maxIntervalMs: +(sorted[sorted.length - 1] ?? 0).toFixed(1), lateFrames: gaps.filter((g) => median > 0 && g > median * 1.5).length,
        mediaAdvanceSec: +((media[media.length - 1] ?? 0) - (media[0] ?? 0)).toFixed(2),
    }
}

export async function playbackRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown> }> {
    const video = ctx.video
    if (!video) throw new Error('the page has no video element')
    const plan = highlightsPlan(ctx, Math.min(ctx.probe.durationSec, 45), 1, false)
    const graphics = await prepareSpec(plan.spec)
    const clipStart = plan.cuts[0]?.startSec ?? 0
    const detail: Record<string, unknown> = {}
    const notes: string[] = []
    const url = URL.createObjectURL(ctx.source.file)
    video.muted = true
    video.playsInline = true
    video.src = url
    try {
        let canPlay = true
        try { await once(video, 'loadeddata') } catch (e) { canPlay = false; notes.push(`This browser could not play the file in a <video>: ${e instanceof Error ? e.message : String(e)}. Only the render time is reported.`) }
        const render = () => run(ctx, plan.cuts, { quality: '1080p', bitrate: bitrateFor('1080p'), ...(graphics ? { graphics } : {}) })
        if (canPlay) detail.playbackAlone = await playWhile(video, clipStart, 10, null).catch((e: unknown) => ({ error: String(e) }))
        const row = await pair('1080p goal clip + replay, source playing', ['render alone', 'render + playback'], async () => {
            const r = await render()
            if (canPlay) detail.playbackWhileRenderingStart = 'n/a'
            return { wallMs: r.wallMs, bytes: r.bytes, detail: { outputSec: plan.seconds, pipeline: r.rendering.stats } }
        }, async () => {
            if (!canPlay) { const r = await render(); return { wallMs: r.wallMs, bytes: r.bytes } }
            const box: { r?: Awaited<ReturnType<typeof render>> } = {}
            const stats = await playWhile(video, clipStart, 5, async () => { box.r = await render() })
            detail.playbackWhileRendering = stats
            const done = box.r!
            return { wallMs: done.wallMs, bytes: done.bytes, detail: { playback: stats, pipeline: done.rendering.stats }, notes: [`dropped ${stats.dropped}/${stats.totalReported} frames, jitter ${stats.jitterMs} ms`] }
        })
        return { rows: [row], notes, detail }
    } finally {
        video.pause()
        video.removeAttribute('src')
        video.load()
        URL.revokeObjectURL(url)
    }
}
