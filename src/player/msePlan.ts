// Pure planning for the Media Source player: what to fetch next, what to evict, which backend to use.
// All times are SOURCE times (seconds, as the file's own timestamps say). The glue converts to and from the
// <video>'s currentTime by the track-start base.

export type Span = { start: number; end: number }
export type SmoothPlayback = 'large' | 'always' | 'off'

/** Segments are cut at keyframes and aim for about this long (the first one after a seek is shorter, to start fast). */
export const SEGMENT_SEC = 6
export const FIRST_SEGMENT_SEC = 2
/** Wanted buffer around the playhead. */
export const AHEAD_SEC = 30
export const BEHIND_SEC = 10
/** Anything outside this band is removed from the buffer. */
export const KEEP_AHEAD_SEC = 60
export const KEEP_BEHIND_SEC = 20
/** "Large" for the default setting: a whole-file blob URL is what struggles on iPad above roughly this size. */
export const LARGE_FILE_BYTES = 500 * 1024 * 1024
/** No loadedmetadata within this long means the player is stuck: use the classic path. */
export const METADATA_TIMEOUT_MS = 8000
const EPS = 1e-3
/** How far a span may start after the playhead and still count as covering it (first keyframe a hair after t). */
const COVER_SLACK = 0.05

/** Sorts and joins spans that touch. */
export function mergeSpans(spans: readonly Span[]): Span[] {
    const sorted = spans.filter((s) => s.end > s.start).map((s) => ({ ...s })).sort((a, b) => a.start - b.start)
    const out: Span[] = []
    for (const s of sorted) {
        const last = out[out.length - 1]
        if (last && s.start <= last.end + EPS) last.end = Math.max(last.end, s.end)
        else out.push(s)
    }
    return out
}

export type FetchPlan = { from: number }

/**
 * What to load next: the segment holding the playhead if it is not buffered, else the one after the contiguous
 * run when less than `ahead` seconds remain in front. Null: nothing to do (enough buffered, or everything is).
 */
export function planNext(time: number, spans: readonly Span[], endSec: number, ahead = AHEAD_SEC): FetchPlan | null {
    if (time >= endSec - EPS) return null
    const run = mergeSpans(spans).find((s) => s.start <= time + COVER_SLACK && s.end > time)
    if (!run) return { from: time }
    if (run.end >= endSec - EPS) return null
    return run.end - time < ahead ? { from: run.end } : null
}

/** Spans to drop because they are outside the kept band around the playhead. */
export function planEviction(time: number, spans: readonly Span[], keepBehind = KEEP_BEHIND_SEC, keepAhead = KEEP_AHEAD_SEC): Span[] {
    return spans.filter((s) => s.end <= time - keepBehind || s.start >= time + keepAhead)
}

/** After a QuotaExceededError: the span furthest from the playhead (never the one being played), or null. */
export function planQuotaEviction(time: number, spans: readonly Span[]): Span | null {
    let worst: Span | null = null
    let worstDist = -1
    for (const s of spans) {
        if (s.start <= time && s.end > time) continue
        const dist = s.start > time ? s.start - time : time - s.end
        // Behind the playhead is cheaper to lose than ahead of it at the same distance.
        const weighted = s.start > time ? dist : dist * 1.5
        if (weighted > worstDist) { worst = s; worstDist = weighted }
    }
    return worst
}

/**
 * Drops spans the browser no longer holds (a ManagedMediaSource may evict by itself). `buffered` is the
 * intersection of every SourceBuffer's ranges, in source time; edges may differ by `slack` between audio and video.
 */
export function reconcileSpans(spans: readonly Span[], buffered: readonly Span[], slack = 0.3): Span[] {
    return spans.filter((s) => buffered.some((b) => b.start <= s.start + slack && b.end >= s.end - slack))
}

/** Ranges present in both lists. */
export function intersectRanges(a: readonly Span[], b: readonly Span[]): Span[] {
    const out: Span[] = []
    for (const x of a) for (const y of b) {
        const start = Math.max(x.start, y.start)
        const end = Math.min(x.end, y.end)
        if (end > start) out.push({ start, end })
    }
    return out
}

/** Keeps only the newest request: seeks that arrive while a segment is being cut replace each other. */
export class LatestWins<T> {
    private value: T | undefined
    private has = false
    push(value: T): void { this.value = value; this.has = true }
    get pending(): boolean { return this.has }
    take(): T | undefined {
        const v = this.value
        this.value = undefined
        this.has = false
        return v
    }
}

export type Backend = 'managed-mse' | 'mse' | 'blob'
export type BackendChoice = { backend: Backend; reason?: string }

/** Which way to play a file. `reason` is set whenever the answer is the classic path. */
export function chooseBackend(o: { setting: SmoothPlayback; fileBytes: number; hasMediaSource: boolean; hasManagedMediaSource: boolean }): BackendChoice {
    if (o.setting === 'off') return { backend: 'blob', reason: 'smooth playback is off' }
    if (o.setting === 'large' && o.fileBytes < LARGE_FILE_BYTES) return { backend: 'blob', reason: 'file is small' }
    if (o.hasManagedMediaSource) return { backend: 'managed-mse' }
    if (o.hasMediaSource) return { backend: 'mse' }
    return { backend: 'blob', reason: 'no MediaSource in this browser' }
}

/** The type string for isTypeSupported / addSourceBuffer. */
export function mseMime(kind: 'video' | 'audio', codecString: string): string {
    return `${kind}/mp4; codecs="${codecString}"`
}

/** Normalises a stored value (older saved settings have none). */
export function smoothSetting(v: unknown): SmoothPlayback {
    return v === 'always' || v === 'off' ? v : 'large'
}
