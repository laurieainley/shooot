// The app's single crash-note tracker: heartbeat timer, pagehide clean-exit flag, and the note found at load.
import { useSyncExternalStore } from 'react'
import { consumeCrash, clearCleanExit, createTracker, HEARTBEAT_MS, markCleanExit, type Activity, type CrashNote, type Tracker } from './utils/crashNote'

const storage = (): Storage | null => { try { return window.localStorage } catch { return null } }

const memory = () => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
    return m ? { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit } : undefined
}

let note: CrashNote | null = null
let dismissed = false
let timer: ReturnType<typeof setInterval> | null = null
let tracker: Tracker | null = null
const listeners = new Set<() => void>()

/** Reads last session's breadcrumb and installs the listeners. Call once, before anything starts an activity. */
export function initCrashNote(): void {
    const s = storage()
    if (!s || tracker) return
    note = consumeCrash(s, Date.now())
    tracker = createTracker({ storage: s, now: () => Date.now(), memory, deviceMemory: () => (navigator as Navigator & { deviceMemory?: number }).deviceMemory })
    window.addEventListener('pagehide', () => markCleanExit(s))
    // Restored from the back/forward cache: the page is live again.
    window.addEventListener('pageshow', (e) => { if (e.persisted) clearCleanExit(s) })
}

/** Used by the app's own deliberate reloads. */
export function markIntentionalReload(): void {
    const s = storage()
    if (s) markCleanExit(s)
}

export function getCrashNote(): CrashNote | null { return dismissed ? null : note }
export function dismissCrashNote(): void { dismissed = true; listeners.forEach((l) => l()) }
export function useCrashNote(): CrashNote | null {
    return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getCrashNote, () => null)
}

function sync(): void {
    if (!tracker) return
    if (tracker.active() && !timer) timer = setInterval(() => tracker?.beat(), HEARTBEAT_MS)
    else if (!tracker.active() && timer) { clearInterval(timer); timer = null }
}

export function startActivity(id: string, activity: Omit<Activity, 'startedAt'>, refresh?: () => Partial<Activity>): void {
    tracker?.start(id, activity, refresh)
    sync()
}

export function endActivity(id: string): void {
    tracker?.end(id)
    sync()
}
