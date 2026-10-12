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
 * there after its download, so the space filled up render by render. Folders (a resumable render's saved progress)
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

/** A plain explanation, with the browser's own numbers when it gives them. */
export async function storageFullMessage(): Promise<string> {
    let room = ''
    try {
        const { quota, usage } = await navigator.storage.estimate()
        if (quota) room = ` The browser allows this site about ${gb(quota)} and ${gb(Math.max(0, quota - (usage ?? 0)))} of that is free.`
    } catch { /* no estimate */ }
    return `Not enough browser storage for this render (this is the browser's limit for the site, not your disk).${room}`
        + ' Free up disk space, use a normal (not private) window on a computer, or render the preview.'
}

export type StorageRoom = {
    quota: number
    /** Space a new render could use: quota minus usage, plus the old renders `clearOldOutputs()` deletes first. */
    free: number
}

/** The browser's size of this site's storage, and how much of it a render could use; null when the browser will not say. */
export async function storageRoom(): Promise<StorageRoom | null> {
    try {
        if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') return null
        const { quota, usage } = await navigator.storage.estimate()
        if (!quota) return null
        let reclaimable = 0
        try {
            const root = await navigator.storage.getDirectory() as FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> }
            if (root.entries) {
                for await (const [, handle] of root.entries()) {
                    if (handle.kind === 'file') reclaimable += (await (handle as FileSystemFileHandle).getFile()).size
                }
            }
        } catch { /* cannot list: count nothing as reclaimable */ }
        return { quota, free: Math.max(0, quota - (usage ?? 0) + reclaimable) }
    } catch { return null }
}
