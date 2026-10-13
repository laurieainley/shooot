// Resumable renders: each finished unit (title card, every cut, full-time card) is a packet log in OPFS
// (render-job-<kind>/u-NNNN.bin, committed when its writable closes) and the progress is saved in IndexedDB.
// One saved job per kind (highlights / fullMatch), so a short highlights render never discards an hour of full-match work. After a reload
// the same render (same signature) carries on after the last finished unit; the logs are muxed into the MP4 at the end.
import { del, get, set } from 'idb-keyval'
import { LogParser, encodeRecord, type LogRecord } from './packetLog'
import type { CutTiming, GraphicsReport } from './types'

/** Before jobs were kept per kind there was one job under this key and folder. */
const LEGACY = 'render-job'
const KINDS: JobKind[] = ['highlights', 'fullMatch']
const keyOf = (kind: JobKind): string => `render-job:${kind}`
const dirOf = (kind: JobKind): string => `render-job-${kind}`

export type JobKind = 'highlights' | 'fullMatch' | 'clip'

export type JobState = {
    kind: JobKind
    signature: string
    /** Output file name (highlights.mp4, full-match.mp4…). */
    outputName: string
    /** Whether this run draws graphics (a graphics failure re-renders without them: a different job). */
    graphics: boolean
    /** Units finished: 0 = none. Unit 0 is the title card, 1…n the cuts, n+1 the full-time card. */
    unitsDone: number
    unitCount: number
    /** Output timeline position and progress after the finished units. */
    cursor: number
    done: number
    total: number
    copied: boolean
    /** Where each cut landed in the output so far (null = not rendered); absent in jobs saved by older versions. */
    timings?: (CutTiming | null)[]
    report: GraphicsReport | null
    /** Sample entries of the output tracks. */
    video: VideoDecoderConfig | null
    audio: AudioDecoderConfig | null
    updatedAt: number
}

/** Moves a job saved under the old single key to its kind's key and folder (only the legacy job of this kind). */
async function migrateLegacy(kind: JobKind): Promise<void> {
    const old = await get<JobState>(LEGACY).catch(() => undefined)
    if (!old || typeof old !== 'object' || old.kind !== kind) return
    let moved = false
    try {
        const root = await navigator.storage.getDirectory()
        const from = await root.getDirectoryHandle(LEGACY)
        const to = await root.getDirectoryHandle(dirOf(kind), { create: true })
        const files = from as FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> }
        moved = true
        for await (const [name, h] of files.entries!()) {
            const m = (h as FileSystemFileHandle & { move?: (d: FileSystemDirectoryHandle, n?: string) => Promise<void> }).move
            if (h.kind !== 'file' || typeof m !== 'function') { moved = false; break }
            await m.call(h, to, name)
        }
        if (moved) await root.removeEntry(LEGACY, { recursive: true }).catch(() => undefined)
    } catch { moved = false }
    if (moved) await set(keyOf(kind), old)
    else await discardLegacy()
    await del(LEGACY).catch(() => undefined)
}

async function discardLegacy(): Promise<void> {
    await del(LEGACY).catch(() => undefined)
    try { await (await navigator.storage.getDirectory()).removeEntry(LEGACY, { recursive: true }) } catch { /* nothing stored */ }
}

export async function loadJob(kind: JobKind): Promise<JobState | null> {
    try {
        let v = await get<JobState>(keyOf(kind))
        if (!v) { await migrateLegacy(kind); v = await get<JobState>(keyOf(kind)) }
        return v && typeof v === 'object' && typeof v.signature === 'string' ? v : null
    } catch {
        return null
    }
}

export async function saveJob(state: JobState): Promise<void> {
    await set(keyOf(state.kind), { ...state, updatedAt: Date.now() })
}

async function dir(kind: JobKind, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
        const root = await navigator.storage.getDirectory()
        return await root.getDirectoryHandle(dirOf(kind), { create })
    } catch {
        return null
    }
}

/** Forgets the saved job of this kind (all kinds, and the pre-per-kind one, when omitted) and deletes its logs. */
export async function discardJob(kind?: JobKind): Promise<void> {
    for (const k of kind ? [kind] : KINDS) {
        await del(keyOf(k)).catch(() => undefined)
        try { await (await navigator.storage.getDirectory()).removeEntry(dirOf(k), { recursive: true }) } catch { /* nothing stored */ }
    }
    if (!kind) await discardLegacy()
    else {
        const old = await get<JobState>(LEGACY).catch(() => undefined)
        if (old && old.kind === kind) await discardLegacy()
    }
}

/** True when this browser can keep unit logs (OPFS writable files). */
export async function canJournal(kind: JobKind): Promise<boolean> {
    const d = await dir(kind, true)
    if (!d) return false
    try {
        const h = await d.getFileHandle('probe', { create: true })
        const ok = typeof (h as FileSystemFileHandle & { createWritable?: unknown }).createWritable === 'function'
        await d.removeEntry('probe').catch(() => undefined)
        return ok
    } catch {
        return false
    }
}

const unitName = (i: number): string => `u-${String(i).padStart(4, '0')}.bin`
const FLUSH_BYTES = 4 * 1024 * 1024

export type UnitWriter = { write: (r: LogRecord) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }

export async function openUnit(kind: JobKind, index: number): Promise<UnitWriter> {
    const d = await dir(kind, true)
    if (!d) throw new Error('no storage for the render')
    const handle = await d.getFileHandle(unitName(index), { create: true })
    const writable = await handle.createWritable()
    let parts: Uint8Array[] = []
    let size = 0
    const flush = async (): Promise<void> => {
        if (size === 0) return
        const chunk = new Uint8Array(size)
        let o = 0
        for (const p of parts) { chunk.set(p, o); o += p.byteLength }
        parts = []
        size = 0
        await writable.write(chunk)
    }
    return {
        write: async (r) => {
            const rec = encodeRecord(r)
            parts.push(rec)
            size += rec.byteLength
            if (size >= FLUSH_BYTES) await flush()
        },
        close: async () => { await flush(); await writable.close() },
        abort: async () => { await writable.abort().catch(() => undefined) },
    }
}

/** Reads a finished unit's packets in order (8 MB at a time). */
export async function* readUnit(kind: JobKind, index: number): AsyncGenerator<LogRecord> {
    const d = await dir(kind, false)
    if (!d) throw new Error('the render’s saved progress is gone')
    const file = await (await d.getFileHandle(unitName(index))).getFile()
    const parser = new LogParser()
    const STEP = 8 * 1024 * 1024
    for (let o = 0; o < file.size; o += STEP) {
        const chunk = new Uint8Array(await file.slice(o, Math.min(file.size, o + STEP)).arrayBuffer())
        yield* parser.push(chunk)
    }
    if (parser.pending > 0) throw new Error('a saved part of the render is damaged')
}

export async function removeUnit(kind: JobKind, index: number): Promise<void> {
    const d = await dir(kind, false)
    await d?.removeEntry(unitName(index)).catch(() => undefined)
}
