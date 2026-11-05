// The export timing log: one record per export (finished, failed or cancelled) and per finished stretch of background preparing, kept on this
// device (IndexedDB) and downloadable as JSON Lines from the ⋯ menu, so exports with and without prepared parts can be compared.
import { del, get, set } from 'idb-keyval'
import type { PipelineStats } from './render/experiments'

const KEY = 'export-timing-log'
/** Most records kept (the oldest go first). */
export const MAX_RECORDS = 2000
export const LOG_FILE_NAME = 'shooot-export-timing-log.jsonl'

/** What the background preparer did before an export, summed over the project's passes of that kind. */
export type PrepareTotals = {
    /** Seconds the preparer actually ran (wall). */
    wallSec: number
    /** Units it encoded, and the output seconds they cover. */
    unitsEncoded: number
    encodedSec: number
    /** Seconds it had work left but was held (the user's Pause, or an export running). */
    pausedSec: number
    /** Seconds it slept between frames or ran one unit at a time because the video was playing or scrubbed. */
    throttledSec: number
}

export type ExportRecord = {
    v: 1
    type: 'export'
    at: string
    project: string | null
    kind: 'highlights' | 'fullMatch' | 'clip'
    quality: 'original' | '4k' | '1080p'
    outcome: 'done' | 'failed' | 'cancelled'
    /** Seconds of output (cards included). */
    outputSec: number
    device: string
    /** 'download' (built in browser storage) or 'file' (Save to file…). */
    save: 'download' | 'file'
    /** The "Export without prepared parts" baseline: the unit cache was off. */
    withoutPrepared: boolean
    /** Render pressed → file ready, and the engine's own part of that (units, muxing, cache copies). */
    wallSec: number
    encodeSec: number | null
    unitsReused: number | null
    unitsTotal: number | null
    /** Output seconds taken from the cache and output seconds encoded now. */
    reusedSec: number | null
    encodedSec: number | null
    /** Wall seconds an encode of everything would take, from this export's measured encode rate (encoded units' wall time ÷ parallel units, per output second) scaled to all units; null when nothing was encoded. */
    estimatedWithoutPreparingSec: number | null
    /** The same from the plain cost model (low/high/mid, seconds) for a full re-encode on this device class. */
    modelFullReencodeSec: { low: number; high: number } | null
    /** Raw numbers behind the estimate: summed wall seconds of the encoded and of the restored units, units run at once. */
    encodedUnitSec: number | null
    restoredUnitSec: number | null
    parallel: number | null
    prepare: PrepareTotals | null
    /** The engine's cache lines (what was reused, what was cleared). */
    notes: string[]
    error?: string
}

export type PrepareRecord = {
    v: 1
    type: 'prepare'
    at: string
    project: string | null
    kind: 'highlights' | 'fullMatch'
    quality: 'original' | '4k' | '1080p'
    outcome: 'ready' | 'stopped' | 'failed' | 'no-space'
    device: string
    /** This stretch of work. */
    wallSec: number
    unitsEncoded: number
    encodedSec: number
    unitsReady: number
    unitsTotal: number
    pausedSec: number
    throttledSec: number
    error?: string
}

export type LogRecord = ExportRecord | PrepareRecord

let queue: Promise<void> = Promise.resolve()

/** Adds a record. Never throws and never waits for the caller: the log must not get in the way of an export. */
export function appendRecord(r: LogRecord): Promise<void> {
    queue = queue.then(async () => {
        try {
            const all = (await get<LogRecord[]>(KEY).catch(() => undefined)) ?? []
            all.push(r)
            await set(KEY, all.length > MAX_RECORDS ? all.slice(all.length - MAX_RECORDS) : all)
        } catch { /* a full or blocked store loses a log line, nothing else */ }
    })
    return queue
}

export async function readRecords(): Promise<LogRecord[]> {
    await queue
    try { return (await get<LogRecord[]>(KEY)) ?? [] } catch { return [] }
}

export async function clearRecords(): Promise<void> {
    await queue
    await del(KEY).catch(() => undefined)
}

/** One JSON object per line; a header line first says what the file is. */
export function toJsonl(records: LogRecord[], meta: { app: string; exportedAt: string; userAgent: string }): string {
    return [JSON.stringify({ v: 1, type: 'header', ...meta, records: records.length }), ...records.map((r) => JSON.stringify(r))].join('\n') + '\n'
}

/** Pure helper for the records' numbers: seconds with one decimal. */
export const sec1 = (ms: number): number => Math.round(ms / 100) / 10

type Nav = { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void>; maxTouchPoints?: number; userAgent?: string }

function anchorDownload(blob: Blob, name: string): boolean {
    try {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.rel = 'noopener'
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        a.remove()
        // The browser reads the blob after the click returns: keep the URL a while (iPad Chrome fetches it late).
        setTimeout(() => URL.revokeObjectURL(url), 120_000)
        return true
    } catch { return false }
}

/** The log as file text, read ahead (when the menu opens) so the click can share or download without waiting: iPad browsers want the share inside the tap. */
export type LogDownload = { count: number; text: string; file: File | null }

export async function loadLogDownload(nav: Nav = typeof navigator === 'undefined' ? {} : navigator as unknown as Nav): Promise<LogDownload> {
    const records = await readRecords()
    const text = records.length === 0 ? '' : toJsonl(records, { app: 'shooot', exportedAt: new Date().toISOString(), userAgent: nav.userAgent ?? '' })
    return { count: records.length, text, file: text && typeof File !== 'undefined' ? new File([text], LOG_FILE_NAME, { type: 'text/plain' }) : null }
}

/**
 * Hands the log to the user. Desktop browsers get a normal download; a touch device that can share files (iPad Chrome/Safari) gets the share sheet
 * first ("Save to Files"), since a blob download from a menu tap is not reliable there; a refused share falls back to the download.
 * Call it straight from the click (no awaits before it). Returns what happened for the menu to show.
 */
export async function deliverLog(d: LogDownload, nav: Nav = typeof navigator === 'undefined' ? {} : navigator as unknown as Nav): Promise<'downloaded' | 'shared' | 'empty' | 'failed'> {
    if (d.count === 0) return 'empty'
    const touch = (nav.maxTouchPoints ?? 0) > 1 || /iPad|iPhone|Android/i.test(nav.userAgent ?? '')
    if (touch && d.file && nav.share && nav.canShare) {
        try {
            if (nav.canShare({ files: [d.file] })) { await nav.share({ files: [d.file], title: 'Shooot export timing log' }); return 'shared' }
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return 'shared' // the user closed the sheet
        }
    }
    return anchorDownload(new Blob([d.text], { type: 'text/plain;charset=utf-8' }), LOG_FILE_NAME) ? 'downloaded' : 'failed'
}

// ---- building an export record ----


export type ExportEnd = { outcome: 'done' | 'failed' | 'cancelled'; wallMs: number; stats: PipelineStats | null; notes: string[]; error?: string }

/** Seconds an all-encoded run would take, from this export's own encode rate (encoded units' summed wall time ÷ units run at once, per output second). Null when nothing was encoded. */
export function estimateWithoutPreparing(stats: PipelineStats | null): number | null {
    if (!stats?.encodedSec || stats.encodedSec < 0.5 || !stats.encodedUnitMs || stats.reusedSec === undefined) return null
    const wall = stats.encodedUnitMs / 1000 / Math.max(1, stats.parallel ?? 1)
    return Math.round(wall * (stats.encodedSec + stats.reusedSec) / stats.encodedSec * 10) / 10
}

const CACHE_NOTE = /unit cache|saved parts|blocks of|prepared/i

export function buildExportRecord(i: {
    now: Date; project: string | null; kind: ExportRecord['kind']; quality: ExportRecord['quality']; outputSec: number; device: string; save: ExportRecord['save']
    withoutPrepared: boolean; end: ExportEnd; model: { low: number; high: number } | null; prepare: PrepareTotals | null
}): ExportRecord {
    const s = i.end.stats
    return {
        v: 1, type: 'export', at: i.now.toISOString(), project: i.project, kind: i.kind, quality: i.quality, outcome: i.end.outcome, outputSec: Math.round(i.outputSec * 10) / 10,
        device: i.device, save: i.save, withoutPrepared: i.withoutPrepared, wallSec: sec1(i.end.wallMs),
        encodeSec: s?.encodeWallMs !== undefined ? sec1(s.encodeWallMs) : null,
        unitsReused: s?.reused?.units ?? (s ? 0 : null), unitsTotal: s?.unitsTotal ?? null,
        reusedSec: s?.reusedSec !== undefined ? Math.round(s.reusedSec * 10) / 10 : null, encodedSec: s?.encodedSec !== undefined ? Math.round(s.encodedSec * 10) / 10 : null,
        estimatedWithoutPreparingSec: estimateWithoutPreparing(s),
        modelFullReencodeSec: i.model ? { low: Math.round(i.model.low), high: Math.round(i.model.high) } : null,
        encodedUnitSec: s?.encodedUnitMs !== undefined ? sec1(s.encodedUnitMs) : null, restoredUnitSec: s?.restoredUnitMs !== undefined ? sec1(s.restoredUnitMs) : null, parallel: s?.parallel ?? null,
        prepare: i.prepare, notes: i.end.notes.filter((n) => CACHE_NOTE.test(n)).slice(0, 12), ...(i.end.error ? { error: i.end.error } : {}),
    }
}
