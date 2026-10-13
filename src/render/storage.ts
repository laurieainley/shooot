import { unitCacheBytes } from './unitCache'

// The browser's private storage (OPFS) that renders write into. It has a per-site cap set by the browser
// (a share of the disk on a computer, far less in a private window or on a phone), separate from free disk space.

/** The render ran out of the browser's storage for this site. */
export function isStorageFull(e: unknown): boolean {
    if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'QuotaExceededError') return true
    const msg = e instanceof Error ? e.message : String(e)
    return /exceed its storage quota|QuotaExceeded|quota exceeded/i.test(msg)
}

/**
 * Deletes finished renders left in the site's storage (every top-level file except `keep`). Each render used to stay
 * there after its download, so the space filled up render by render. Folders (a resumable render's saved progress, one per kind)
 * are left alone.
 */
export async function clearOldOutputs(keep?: string): Promise<number> {
    let removed = 0
    try {
        const root = await navigator.storage.getDirectory() as FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> }
        if (!root.entries) return 0
        for await (const [name, handle] of root.entries()) {
            if (handle.kind !== 'file' || name === keep) continue
            await root.removeEntry(name).then(() => { removed++ }, () => undefined)
        }
    } catch { /* no storage: nothing to clear */ }
    return removed
}

const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`

/** A plain explanation, with the browser's own numbers when it gives them. `cleared`: the saved parts of earlier exports were just deleted to make room. */
export async function storageFullMessage(cleared = false): Promise<string> {
    let room = ''
    try {
        const { quota, usage } = await navigator.storage.estimate()
        if (quota) room = ` The browser allows this site about ${gb(quota)} and ${gb(Math.max(0, quota - (usage ?? 0)))} of that is free.`
    } catch { /* no estimate */ }
    return `Not enough browser storage for this render (this is the browser's limit for the site, not your disk).${room}`
        + ' Free up disk space, use a normal (not private) window on a computer, or render the preview.'
        + (cleared ? ' The saved parts of earlier exports were cleared, so trying again may work.' : '')
}

export type StorageRoom = {
    quota: number
    /** Space a new render could use: quota minus usage, plus the old renders `clearOldOutputs()` deletes first and the saved parts of earlier exports (the unit cache), which a render evicts before it would run short. */
    free: number
    /** Of `free`: what the unit cache holds. */
    cache?: number
}

/** Deletes the unit cache (saved parts of earlier exports). The next export of a kind then encodes everything. Never throws. */
export { clearUnitCache as clearSavedParts } from './unitCache'

/**
 * Usage the browser reports beyond what this site's own files add up to, above which the report is not believed. WebKit (Safari, and
 * every iPad/iPhone browser) can report far more than the site stores: an iPad said 129 GB used while its file area held 0 GB and the
 * whole Chrome app took 19 GB. Believing it would grey out exports that fit easily.
 */
export const USAGE_SLACK = 1e9

type Dir = FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> }

/** This site's file area: every file's size (folders included), and the top-level files (finished renders, which a render deletes first). Null when it can't be listed. */
async function measureFiles(): Promise<{ total: number; topFiles: number } | null> {
    try {
        const root = await navigator.storage.getDirectory() as Dir
        if (!root.entries) return null
        const walk = async (dir: Dir): Promise<number> => {
            let n = 0
            for await (const [, h] of dir.entries!()) {
                try { n += h.kind === 'file' ? (await (h as FileSystemFileHandle).getFile()).size : await walk(h as Dir) } catch { /* gone meanwhile */ }
            }
            return n
        }
        let total = 0
        let topFiles = 0
        for await (const [, h] of root.entries()) {
            try {
                if (h.kind === 'file') { const size = (await (h as FileSystemFileHandle).getFile()).size; topFiles += size; total += size } else if ((h as Dir).entries) total += await walk(h as Dir)
            } catch { /* gone meanwhile */ }
        }
        return { total, topFiles }
    } catch { return null }
}

/** The browser's size of this site's storage, and how much of it a render could use; null when the browser will not say. */
export async function storageRoom(): Promise<StorageRoom | null> {
    try {
        if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') return null
        const { quota, usage } = await navigator.storage.estimate()
        if (!quota) return null
        const files = await measureFiles()
        // A report far above what the site's files add up to is the browser miscounting (see USAGE_SLACK): count the files instead.
        const used = files && (usage ?? 0) > files.total + USAGE_SLACK ? files.total : (usage ?? 0)
        const cache = await unitCacheBytes()
        return { quota, free: Math.max(0, quota - used + (files?.topFiles ?? 0) + cache), ...(cache > 0 ? { cache } : {}) }
    } catch { return null }
}
