/** A seek waiting for its file to load: applied on that file's `loadedmetadata`, never on a timer. */
export type PendingSeek = { fileIndex: number; timeSec: number; play: boolean }

/**
 * Whether a seek can be applied to the player now, or must wait for its file. It waits when it targets another file,
 * or the current file is still loading (its source was just switched, or an earlier seek is still waiting for it).
 */
export function seekNow(target: number, currentFileIndex: number, metadataLoaded: boolean, pending: PendingSeek | null): boolean {
    return target === currentFileIndex && metadataLoaded && pending === null
}

/** The time a `timeupdate` may report to the playhead: none while a seek waits (a loading file reports 0). */
export function reportedTime(t: number, pending: PendingSeek | null): number | null {
    return pending ? null : t
}
