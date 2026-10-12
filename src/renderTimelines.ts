// Where the cuts of the last finished render of each kind really landed, kept with the signature of the plan that was
// rendered (see ExportPlan.signature). The YouTube description uses it only while the current plan has the same signature.
import { useSyncExternalStore } from 'react'
import type { RenderTimeline } from './render/types'

export type SavedTimeline = { signature: string; timeline: RenderTimeline }
type Kind = 'highlights' | 'fullMatch'

const KEY = 'render-timelines'
const listeners = new Set<() => void>()
let cache: Partial<Record<Kind, SavedTimeline>> | null = null

function all(): Partial<Record<Kind, SavedTimeline>> {
    if (cache) return cache
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Kind, SavedTimeline>>
        cache = raw && typeof raw === 'object' ? raw : {}
    } catch {
        cache = {}
    }
    return cache
}

export function savedTimeline(kind: Kind): SavedTimeline | null {
    const v = all()[kind]
    return v && typeof v.signature === 'string' && Array.isArray(v.timeline) ? v : null
}

export function saveTimeline(kind: Kind, signature: string, timeline: RenderTimeline): void {
    cache = { ...all(), [kind]: { signature, timeline } }
    try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* private window / quota: kept for this session only */ }
    listeners.forEach((l) => l())
}

/** Tests: forget everything. */
export function resetTimelines(): void {
    cache = {}
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    listeners.forEach((l) => l())
}

export function useSavedTimeline(kind: Kind): SavedTimeline | null {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
        () => savedTimeline(kind),
    )
}
