// "The page reloaded during X": a small breadcrumb kept in localStorage while heavy work runs (synchronous, so it
// survives a tab the browser killed for memory). Pure logic with injected storage and clock; wiring is in crashNoteRuntime.ts.

export const BREADCRUMB_KEY = 'shooot-crash-breadcrumb'
export const CLEAN_EXIT_KEY = 'shooot-clean-exit'
/** A breadcrumb whose last heartbeat is older than this at the next load is too old to blame for the reload. */
export const RECENT_MS = 2 * 60 * 1000
export const HEARTBEAT_MS = 2000

export type ActivityKind = 'find-goals' | 'ball-check' | 'render' | 'playback'

export type ActivityFile = { name: string; sizeBytes: number; codec?: string; kind?: string }

export type Activity = {
    kind: ActivityKind
    /** Extra words, e.g. the render kind. */
    label?: string
    startedAt: number
    files: ActivityFile[]
    /** Playback only: the playhead at the last heartbeat (seconds in the file). */
    currentTime?: number
}

export type MemorySnapshot = { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number }

export type Breadcrumb = {
    activities: Record<string, Activity>
    heartbeatAt: number
    memory?: MemorySnapshot
    deviceMemory?: number
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type CrashNote = {
    breadcrumb: Breadcrumb
    /** The activity to name in the message. */
    primary: Activity
    /** Also running when the page went away (e.g. playback during Find goals). */
    others: Activity[]
    at: number
}

const safe = <T>(fn: () => T): T | null => { try { return fn() } catch { return null } }

export function readBreadcrumb(storage: StorageLike): Breadcrumb | null {
    const raw = safe(() => storage.getItem(BREADCRUMB_KEY))
    if (!raw) return null
    try {
        const b = JSON.parse(raw) as Breadcrumb
        if (!b || typeof b.heartbeatAt !== 'number' || typeof b.activities !== 'object' || !b.activities) return null
        return b
    } catch {
        return null
    }
}

/** Marks the exit as deliberate (pagehide, or an app-initiated reload): the next load will not call it a crash. */
export function markCleanExit(storage: StorageLike): void {
    safe(() => storage.setItem(CLEAN_EXIT_KEY, '1'))
}

export function clearCleanExit(storage: StorageLike): void {
    safe(() => storage.removeItem(CLEAN_EXIT_KEY))
}

const PRIORITY: ActivityKind[] = ['find-goals', 'ball-check', 'render', 'playback']

/**
 * Called once at load: decides whether the last session ended without a clean exit while work was running.
 * Always consumes the stored state (breadcrumb and clean flag), so a note is shown at most once.
 */
export function consumeCrash(storage: StorageLike, now: number): CrashNote | null {
    const breadcrumb = readBreadcrumb(storage)
    const clean = safe(() => storage.getItem(CLEAN_EXIT_KEY)) === '1'
    safe(() => storage.removeItem(BREADCRUMB_KEY))
    safe(() => storage.removeItem(CLEAN_EXIT_KEY))
    if (!breadcrumb || clean) return null
    if (now - breadcrumb.heartbeatAt > RECENT_MS) return null
    const list = Object.values(breadcrumb.activities)
    if (list.length === 0) return null
    list.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
    return { breadcrumb, primary: list[0], others: list.slice(1), at: breadcrumb.heartbeatAt }
}

const KIND_WORDS: Record<ActivityKind, string> = { 'find-goals': 'Find goals', 'ball-check': 'Find goals (ball check)', render: 'an export', playback: 'video playback' }

export const formatBytes = (n: number): string => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${(n / 1048576).toFixed(1)} MB`)

const clock = (ms: number): string => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export function activityName(a: Activity): string {
    return a.kind === 'render' && a.label ? `${KIND_WORDS.render} (${a.label})` : KIND_WORDS[a.kind]
}

const fileBit = (f: ActivityFile): string => `${f.name}, ${formatBytes(f.sizeBytes)}`

/** The one-line message shown to the user. */
export function describeCrash(note: CrashNote): string {
    const { primary, others } = note
    const filesOf = (a: Activity): string => a.files.slice(0, 1).map(fileBit).join('') + (a.files.length > 1 ? ` and ${a.files.length - 1} more` : '')
    const playing = (primary.kind === 'playback' ? primary : others.find((o) => o.kind === 'playback'))
    let detail = ''
    if (primary.kind === 'playback') detail = primary.files.length ? ` (${filesOf(primary)})` : ''
    else if (playing && playing.files.length) detail = ` (playing ${fileBit(playing.files[0])})`
    else if (primary.files.length) detail = ` (${filesOf(primary)})`
    return `The page reloaded by itself during ${activityName(primary)} at ${clock(note.at)}${detail}. This usually means the browser ran out of memory.`
}

const mbOf = (n?: number): string => (typeof n === 'number' ? `${(n / 1048576).toFixed(0)} MB` : 'n/a')

/** Plain-text details for pasting into a chat. `extra` is appended (the playback log). */
export function crashReportText(note: CrashNote, env: { userAgent?: string; platform?: string }, extra = ''): string {
    const b = note.breadcrumb
    const L: string[] = ['Shooot crash note', describeCrash(note), '']
    L.push(`Last heartbeat: ${new Date(b.heartbeatAt).toISOString()}`)
    L.push(`User agent: ${env.userAgent ?? 'n/a'}`, `Platform: ${env.platform ?? 'n/a'}`, `Device memory: ${b.deviceMemory ?? 'n/a'} GB`)
    L.push(`JS heap at last heartbeat: used ${mbOf(b.memory?.usedJSHeapSize)}, total ${mbOf(b.memory?.totalJSHeapSize)}, limit ${mbOf(b.memory?.jsHeapSizeLimit)}`)
    L.push('', 'ACTIVITIES')
    for (const [id, a] of Object.entries(b.activities)) {
        L.push(`${id}: ${activityName(a)}, started ${new Date(a.startedAt).toISOString()} (${Math.round((b.heartbeatAt - a.startedAt) / 1000)} s before the last heartbeat)${a.currentTime !== undefined ? `, playhead ${a.currentTime.toFixed(1)} s` : ''}`)
        for (const f of a.files) L.push(`  ${f.name} (${formatBytes(f.sizeBytes)})${f.codec ? `, ${f.codec}` : ''}${f.kind ? `, ${f.kind}` : ''}`)
    }
    if (extra) L.push('', extra)
    return L.join('\n')
}

export type TrackerDeps = {
    storage: StorageLike
    now: () => number
    memory?: () => MemorySnapshot | undefined
    deviceMemory?: () => number | undefined
}

export type Tracker = {
    /** Starts (or replaces) an activity. `refresh` runs at each heartbeat to update live fields (the playhead). */
    start: (id: string, activity: Omit<Activity, 'startedAt'>, refresh?: () => Partial<Activity>) => void
    end: (id: string) => void
    /** Writes the breadcrumb now (the runtime calls this every HEARTBEAT_MS while `active()`). */
    beat: () => void
    active: () => boolean
}

/** Keeps the breadcrumb current; removes it when the last activity ends normally. */
export function createTracker(deps: TrackerDeps): Tracker {
    const activities = new Map<string, Activity>()
    const refreshers = new Map<string, () => Partial<Activity>>()
    const write = (): void => {
        if (activities.size === 0) { safe(() => deps.storage.removeItem(BREADCRUMB_KEY)); return }
        for (const [id, fn] of refreshers) {
            const a = activities.get(id)
            if (a) activities.set(id, { ...a, ...safe(fn) })
        }
        const memory = safe(() => deps.memory?.())
        const deviceMemory = safe(() => deps.deviceMemory?.())
        const b: Breadcrumb = { activities: Object.fromEntries(activities), heartbeatAt: deps.now(), ...(memory ? { memory } : {}), ...(deviceMemory ? { deviceMemory } : {}) }
        safe(() => deps.storage.setItem(BREADCRUMB_KEY, JSON.stringify(b)))
    }
    return {
        start: (id, activity, refresh) => {
            activities.set(id, { ...activity, startedAt: deps.now() })
            if (refresh) refreshers.set(id, refresh)
            else refreshers.delete(id)
            // A fresh activity means the previous exit flag no longer applies.
            safe(() => deps.storage.removeItem(CLEAN_EXIT_KEY))
            write()
        },
        end: (id) => { activities.delete(id); refreshers.delete(id); write() },
        beat: write,
        active: () => activities.size > 0,
    }
}
