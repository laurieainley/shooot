// Playback diagnostics: a ring buffer of the video element's events (with the state at each), the sources played, stuck
// detection, a throttled copy in localStorage (so a crash leaves it behind) and the plain-text report for pasting in a chat.
import type { StorageLike } from './crashNote'

export const PLAYBACK_LOG_KEY = 'shooot-playback-log'
export const LOG_CAPACITY = 300
export const PERSIST_MS = 2000
export const STUCK_MS = 10_000

export type LogEntry = {
    t: number
    /** event: a media element event; source: file or source change; stuck: a stuck state; note: anything else (jumps, switches). */
    type: 'event' | 'source' | 'stuck' | 'note'
    name: string
    detail?: string
    currentTime?: number
    readyState?: number
    networkState?: number
    buffered?: string
}

export type SourceInfo = { at: number; name: string; sizeBytes: number; kind?: string; codec?: string }

export type PlaybackLogData = { sources: SourceInfo[]; entries: LogEntry[] }

/** "0–12.3, 40–51" */
export function summariseRanges(ranges: ReadonlyArray<readonly [number, number]>): string {
    if (ranges.length === 0) return 'none'
    const n = (x: number): string => String(Math.round(x * 10) / 10)
    return ranges.map(([a, b]) => `${n(a)}–${n(b)}`).join(', ')
}

export function timeRangesToList(r: { length: number; start(i: number): number; end(i: number): number } | null | undefined): [number, number][] {
    const out: [number, number][] = []
    if (!r) return out
    for (let i = 0; i < r.length; i++) out.push([r.start(i), r.end(i)])
    return out
}

export type PlaybackLog = {
    add: (e: Omit<LogEntry, 't'>) => void
    addSource: (s: Omit<SourceInfo, 'at'>) => void
    entries: () => LogEntry[]
    sources: () => SourceInfo[]
    data: () => PlaybackLogData
    /** Writes to storage if at least PERSIST_MS passed since the last write, otherwise schedules one (via `schedule`). */
    persistSoon: () => void
    flush: () => void
}

export type LogDeps = {
    now: () => number
    storage?: StorageLike
    capacity?: number
    /** Timer for the trailing write; injectable for tests. */
    schedule?: (fn: () => void, ms: number) => unknown
}

const MAX_SOURCES = 30

export function createPlaybackLog(deps: LogDeps): PlaybackLog {
    const capacity = deps.capacity ?? LOG_CAPACITY
    const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms))
    let entries: LogEntry[] = []
    let sources: SourceInfo[] = []
    let lastWrite = -Infinity
    let pending = false
    const flush = (): void => {
        pending = false
        lastWrite = deps.now()
        try { deps.storage?.setItem(PLAYBACK_LOG_KEY, JSON.stringify({ sources, entries } satisfies PlaybackLogData)) } catch { /* full or private mode */ }
    }
    const persistSoon = (): void => {
        if (!deps.storage || pending) return
        const wait = PERSIST_MS - (deps.now() - lastWrite)
        if (wait <= 0) flush()
        else { pending = true; schedule(flush, wait) }
    }
    return {
        add: (e) => {
            entries.push({ t: deps.now(), ...e })
            if (entries.length > capacity) entries = entries.slice(entries.length - capacity)
            persistSoon()
        },
        addSource: (s) => {
            sources.push({ at: deps.now(), ...s })
            if (sources.length > MAX_SOURCES) sources = sources.slice(-MAX_SOURCES)
            persistSoon()
        },
        entries: () => entries,
        sources: () => sources,
        data: () => ({ sources, entries }),
        persistSoon,
        flush,
    }
}

export function readStoredPlaybackLog(storage: StorageLike): PlaybackLogData | null {
    try {
        const raw = storage.getItem(PLAYBACK_LOG_KEY)
        if (!raw) return null
        const d = JSON.parse(raw) as PlaybackLogData
        return Array.isArray(d?.entries) && Array.isArray(d?.sources) ? d : null
    } catch {
        return null
    }
}

export type PlaybackEnv = {
    userAgent?: string; platform?: string; deviceMemory?: number; hardwareConcurrency?: number
    mse: boolean; managedMse: boolean
}

export function collectPlaybackEnv(): PlaybackEnv {
    const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & { deviceMemory?: number }
    const g = globalThis as Record<string, unknown>
    return { userAgent: nav.userAgent, platform: nav.platform, deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency, mse: typeof g.MediaSource !== 'undefined', managedMse: typeof g.ManagedMediaSource !== 'undefined' }
}

const hms = (ms: number): string => { const d = new Date(ms); const p = (n: number, w = 2): string => String(n).padStart(w, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}` }
const mb = (n: number): string => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`)

/** The text report: environment, sources, then the event log (oldest first). */
export function formatPlaybackReport(data: PlaybackLogData, env: PlaybackEnv): string {
    const L: string[] = ['Shooot playback diagnostics', '']
    L.push('ENVIRONMENT', `User agent: ${env.userAgent ?? 'n/a'}`, `Platform: ${env.platform ?? 'n/a'}`,
        `CPU threads: ${env.hardwareConcurrency ?? 'n/a'}   Device memory: ${env.deviceMemory ?? 'n/a'} GB`,
        `MediaSource: ${env.mse ? 'yes' : 'NO'}   ManagedMediaSource: ${env.managedMse ? 'yes' : 'NO'}`)
    L.push('', 'SOURCES')
    if (data.sources.length === 0) L.push('(none played)')
    for (const s of data.sources) L.push(`${hms(s.at)}  ${s.name} (${mb(s.sizeBytes)})${s.kind ? `, ${s.kind}` : ''}${s.codec ? `, ${s.codec}` : ''}`)
    L.push('', `EVENTS (${data.entries.length}, oldest first)`)
    if (data.entries.length === 0) L.push('(none recorded)')
    for (const e of data.entries) {
        const state = e.type === 'event' || e.type === 'stuck'
            ? `  t=${e.currentTime !== undefined ? e.currentTime.toFixed(2) : '?'} rs=${e.readyState ?? '?'} ns=${e.networkState ?? '?'} buf=[${e.buffered ?? '?'}]`
            : ''
        const tag = e.type === 'stuck' ? '!! ' : e.type === 'event' ? '' : `${e.type}: `
        L.push(`${hms(e.t)}  ${tag}${e.name}${e.detail ? ` (${e.detail})` : ''}${state}`)
    }
    return L.join('\n')
}

export type StuckDeps = {
    onStuck: (what: 'waiting' | 'seeking') => void
    set?: (fn: () => void, ms: number) => unknown
    clear?: (h: unknown) => void
    ms?: number
}

/** `waiting` with no `playing`, or `seeking` with no `seeked`, within `ms` (10 s) is reported once through onStuck. */
export function createStuckDetector(d: StuckDeps) {
    const set = d.set ?? ((fn, ms) => setTimeout(fn, ms))
    const clear = d.clear ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
    const ms = d.ms ?? STUCK_MS
    const timers: { waiting?: unknown; seeking?: unknown } = {}
    const arm = (k: 'waiting' | 'seeking'): void => { if (timers[k] === undefined) timers[k] = set(() => { timers[k] = undefined; d.onStuck(k) }, ms) }
    const disarm = (k: 'waiting' | 'seeking'): void => { if (timers[k] !== undefined) { clear(timers[k]); timers[k] = undefined } }
    return {
        /** Feed every media event name. */
        event: (name: string): void => {
            if (name === 'waiting') arm('waiting')
            else if (name === 'seeking') arm('seeking')
            else if (name === 'playing' || name === 'pause' || name === 'ended' || name === 'emptied' || name === 'error' || name === 'abort') disarm('waiting')
            if (name === 'seeked' || name === 'emptied' || name === 'error' || name === 'abort') disarm('seeking')
        },
        dispose: (): void => { disarm('waiting'); disarm('seeking') },
    }
}
