// Resumable renders: each finished unit (title card, every cut, full-time card) is a packet log in OPFS
// (render-job/u-NNNN.bin, committed when its writable closes) and the progress is saved in IndexedDB. After a reload
// the same render (same signature) carries on after the last finished unit; the logs are muxed into the MP4 at the end.
import { del, get, set } from 'idb-keyval'
import { LogParser, encodeRecord, type LogRecord } from './packetLog'
import type { GraphicsReport } from './types'

const KEY = 'render-job'
const DIR = 'render-job'

export type JobKind = 'highlights' | 'fullMatch'

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
    report: GraphicsReport | null
    /** Sample entries of the output tracks. */
    video: VideoDecoderConfig | null
    audio: AudioDecoderConfig | null
    updatedAt: number
}

export async function loadJob(): Promise<JobState | null> {
    try {
        const v = await get<JobState>(KEY)
        return v && typeof v === 'object' && typeof v.signature === 'string' ? v : null
    } catch {
        return null
    }
}

export async function saveJob(state: JobState): Promise<void> {
    await set(KEY, { ...state, updatedAt: Date.now() })
}

async function dir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
        const root = await navigator.storage.getDirectory()
        return await root.getDirectoryHandle(DIR, { create })
    } catch {
        return null
    }
}

/** Forgets the job and deletes its logs. */
export async function discardJob(): Promise<void> {
    await del(KEY).catch(() => undefined)
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(DIR, { recursive: true })
    } catch { /* nothing stored */ }
}

/** True when this browser can keep unit logs (OPFS writable files). */
export async function canJournal(): Promise<boolean> {
    const d = await dir(true)
    if (!d) return false
    try {
        const h = await d.getFileHandle('probe', { create: true })
        return typeof (h as FileSystemFileHandle & { createWritable?: unknown }).createWritable === 'function'
    } catch {
        return false
    }
}

const unitName = (i: number): string => `u-${String(i).padStart(4, '0')}.bin`
const FLUSH_BYTES = 4 * 1024 * 1024

export type UnitWriter = { write: (r: LogRecord) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }

export async function openUnit(index: number): Promise<UnitWriter> {
    const d = await dir(true)
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
export async function* readUnit(index: number): AsyncGenerator<LogRecord> {
    const d = await dir(false)
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

export async function removeUnit(index: number): Promise<void> {
    const d = await dir(false)
    await d?.removeEntry(unitName(index)).catch(() => undefined)
}
