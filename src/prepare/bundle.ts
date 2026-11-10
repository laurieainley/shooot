// The prepared parts file (`.shooot-parts`): the project plus the unit cache's prepared units, in one file that travels from a phone / iPad to the Mac.
//
// Layout: the magic bytes (see MAGIC), a 4-byte little-endian header length, the JSON header, then the units' `.bin` bytes back to back. Header offsets are
// relative to the end of the header. The writer composes a Blob of the cache's OPFS `File` objects (no second copy on disk); the reader streams
// each unit through `importUnit`, so a unit is stored whole or not at all.
import { RENDER_VERSION, isPortableKey, preparedUnits, readUnitFiles, importUnit, type CacheKind } from '../render/unitCache'
import { LogParser, type LogRecord } from '../render/packetLog'
import { buildTransferPayload, decodeProject, encodeProject, type TransferPayload } from '../utils/projectTransfer'
import { useAppState } from '../state'

export const MAGIC = new TextEncoder().encode('shooot-parts\n')
export const FORMAT = 1
const MAX_HEADER = 16 * 1024 * 1024
const MAX_UNITS = 20_000
const MAX_PROJECT_CHARS = 8 * 1024 * 1024
const MAX_PROJECT_BYTES = 32 * 1024 * 1024
const MAX_DEVICE = 64
const STEP = 8 * 1024 * 1024

export type BundleUnit = { portable: string; which: CacheKind; bytes: number; records: number; offset: number; codec: string; description: string; applied: string[] }
export type BundleHeader = { format: number; renderVersion: string; device: string; createdAt: number; projectId?: string | null; project: string; units: BundleUnit[] }
export type BundleImport = { project: TransferPayload | null; imported: number; refused: string | null; device: string; cancelled: boolean; skipped: { space: number; damaged: number; failed: number } }

/** A short name for this device, for "prepared on <device>". */
export function deviceLabel(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): string {
    if (/iPhone|iPod/i.test(ua)) return 'iPhone'
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'iPad'
    if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet'
    if (/Macintosh/i.test(ua)) return 'Mac'
    if (/Windows/i.test(ua)) return 'Windows PC'
    return 'another device'
}

/** How many records a stored unit holds (read in steps, never whole). */
async function countRecords(file: File): Promise<number> {
    const parser = new LogParser()
    let n = 0
    for (let o = 0; o < file.size; o += STEP) n += parser.push(new Uint8Array(await file.slice(o, Math.min(file.size, o + STEP)).arrayBuffer())).length
    return n
}

type CompleteUnit = { key: string; which: CacheKind; portable: string; file: File; applied: string[]; codec: string; description: string; records: number }

/** The prepared units (of `kinds`, default all) that are complete on disk, with their stored bytes. Records are counted only for the file itself (`count`). */
async function completeUnits(kinds: CacheKind[] | undefined, count: boolean): Promise<CompleteUnit[]> {
    const out: CompleteUnit[] = []
    const seen = new Set<string>()
    for (const { which, key } of await preparedUnits()) {
        if (kinds && !kinds.includes(which)) continue
        const u = await readUnitFiles(key)
        const portable = u?.meta.portable
        if (!u || !u.meta.video || !portable || !isPortableKey(portable) || seen.has(portable)) continue
        seen.add(portable)
        if (u.file.size <= 0) continue
        out.push({ key, which, portable, file: u.file, applied: u.meta.applied, codec: u.meta.video.codec, description: u.meta.video.description, records: count ? await countRecords(u.file) : 0 })
    }
    return out
}

/** How many prepared units (and how many bytes) a parts file would hold now (cheap: no unit is read). */
export async function preparedSummary(o: { kinds?: CacheKind[] } = {}): Promise<{ units: number; bytes: number }> {
    const u = await completeUnits(o.kinds, false)
    return { units: u.length, bytes: u.reduce((a, x) => a + x.file.size, 0) }
}

/** The parts file for the open project: header + the prepared units, as a Blob over the cache's own files. */
export async function buildBundle(projectId: string | null, o: { project?: TransferPayload; device?: string; now?: number; kinds?: CacheKind[] } = {}): Promise<Blob> {
    const units = await completeUnits(o.kinds, true)
    let offset = 0
    const header: BundleHeader = {
        format: FORMAT, renderVersion: RENDER_VERSION, device: o.device ?? deviceLabel(), createdAt: o.now ?? Date.now(), projectId,
        project: await encodeProject(o.project ?? buildTransferPayload(useAppState.getState())),
        units: units.map((u) => { const e: BundleUnit = { portable: u.portable, which: u.which, bytes: u.file.size, records: u.records, offset, codec: u.codec, description: u.description, applied: u.applied }; offset += u.file.size; return e }),
    }
    const json = new TextEncoder().encode(JSON.stringify(header))
    const len = new Uint8Array(4)
    new DataView(len.buffer).setUint32(0, json.length, true)
    // The cache may trim a unit while the file is being made (the Blob only points at it): look at each once more just before returning. The cache has no
    // pin for this; the caller keeps the render and the preparer quiet while saving, and a File that is gone throws here rather than later in the writer.
    for (const u of units) {
        const again = await readUnitFiles(u.key)
        if (!again || again.file.size !== u.file.size) throw new Error('A prepared part changed while the file was being made. Try saving again.')
        await again.file.slice(0, 1).arrayBuffer()
    }
    return new Blob([MAGIC, len, json, ...units.map((u) => u.file)], { type: 'application/octet-stream' })
}

/** The header of a parts file and where its unit bytes start; null when the file is not a parts file. */
export async function readBundleHeader(file: File): Promise<{ header: BundleHeader; dataStart: number } | null> {
    try {
        const start = MAGIC.length + 4
        if (file.size < start) return null
        const head = new Uint8Array(await file.slice(0, start).arrayBuffer())
        if (!MAGIC.every((b, i) => head[i] === b)) return null
        const n = new DataView(head.buffer).getUint32(MAGIC.length, true)
        if (n > MAX_HEADER || start + n > file.size) return null
        const h = JSON.parse(await file.slice(start, start + n).text()) as BundleHeader
        if (!h || typeof h !== 'object' || !Array.isArray(h.units)) return null
        return { header: h, dataStart: start + n }
    } catch { return null }
}

const deviceOf = (h: BundleHeader): string => (typeof h.device === 'string' ? h.device.trim().slice(0, MAX_DEVICE) : '') || 'another device'

async function projectOf(h: BundleHeader): Promise<TransferPayload | null> {
    try { if (typeof h.project === 'string' && h.project.length <= MAX_PROJECT_CHARS) return await decodeProject(h.project, MAX_PROJECT_BYTES) } catch { /* the parts can still be used */ }
    return null
}

/** A look at a parts file before loading it: its project (null when unreadable), the device that made it and how many parts it lists. Null when it is not a parts file. */
export async function readBundleProject(file: File): Promise<{ project: TransferPayload | null; device: string; units: number } | null> {
    const parsed = await readBundleHeader(file)
    if (!parsed) return null
    return { project: await projectOf(parsed.header), device: deviceOf(parsed.header), units: parsed.header.units.length }
}

const isUnit = (u: unknown): u is BundleUnit => {
    const x = u as BundleUnit
    return !!x && typeof x.portable === 'string' && Number.isSafeInteger(x.bytes) && x.bytes > 0 && Number.isSafeInteger(x.records) && x.records > 0
        && Number.isSafeInteger(x.offset) && x.offset >= 0 && typeof x.codec === 'string' && typeof x.description === 'string' && Array.isArray(x.applied)
}

const freeBytes = async (): Promise<number | null> => { try { const { quota, usage } = await navigator.storage.estimate(); return quota ? Math.max(0, quota - (usage ?? 0)) : null } catch { return null } }

const abortError = (): DOMException => new DOMException('cancelled', 'AbortError')

/**
 * Loads a parts file: returns its project and copies its units into the unit cache. Parts are skipped (project still returned) when the file's
 * format or render version is not this build's. Cancelling rolls the unit in progress back; the ones already stored stay. Throws when the file is not a parts file.
 */
export async function importBundle(file: File, onProgress: (doneBytes: number, totalBytes: number) => void, signal: AbortSignal): Promise<BundleImport> {
    const parsed = await readBundleHeader(file)
    if (!parsed) throw new Error('This is not a prepared parts file.')
    const { header: h, dataStart } = parsed
    const device = deviceOf(h)
    const project = await projectOf(h)
    const out: BundleImport = { project, imported: 0, refused: null, device, cancelled: false, skipped: { space: 0, damaged: 0, failed: 0 } }
    if (h.format !== FORMAT) { out.refused = 'This prepared parts file is from a different version of the app, so its parts were skipped. The project was loaded.'; return out }
    if (h.renderVersion !== RENDER_VERSION) { out.refused = 'These prepared parts were made by a different version of the app, so they were skipped. The project was loaded.'; return out }
    if (h.units.length > MAX_UNITS) { out.refused = 'This prepared parts file is damaged, so its parts were skipped. The project was loaded.'; return out }
    // Sound units only: whole fields, a portable key, inside the file, and no byte range or key shared with another unit.
    const units: BundleUnit[] = []
    const keys = new Set<string>()
    const ranges: [number, number][] = []
    for (const raw of h.units) {
        if (!isUnit(raw) || !isPortableKey(raw.portable) || dataStart + raw.offset + raw.bytes > file.size) { out.skipped.damaged++; continue }
        if (keys.has(raw.portable) || ranges.some(([a, b]) => raw.offset < b && a < raw.offset + raw.bytes)) { out.skipped.damaged++; continue }
        keys.add(raw.portable); ranges.push([raw.offset, raw.offset + raw.bytes])
        units.push({ ...raw, applied: raw.applied.filter((a): a is string => typeof a === 'string') })
    }
    const total = units.reduce((a, u) => a + u.bytes, 0)
    const batch = `${device}·${h.createdAt}`
    let done = 0
    onProgress(0, total)
    for (const u of units) {
        if (signal.aborted) { out.cancelled = true; return out }
        const base = done
        let bad = false
        async function* records(): AsyncGenerator<LogRecord> {
            const parser = new LogParser()
            let count = 0
            const from = dataStart + u.offset
            for (let o = 0; o < u.bytes; o += STEP) {
                if (signal.aborted) throw abortError()
                const end = Math.min(u.bytes, o + STEP)
                let got: LogRecord[]
                try { got = parser.push(new Uint8Array(await file.slice(from + o, from + end).arrayBuffer())) } catch (e) { bad = true; throw e }
                count += got.length
                yield* got
                onProgress(base + end, total)
            }
            if (parser.pending > 0 || count !== u.records) { bad = true; throw new Error('prepared part is damaged') }
        }
        const ok = await importUnit(u.portable, records(), { applied: u.applied, video: { codec: u.codec, description: u.description }, device, batch, bytes: u.bytes })
        if (signal.aborted) { out.cancelled = true; if (ok) out.imported++; return out }
        if (ok) out.imported++
        else if (bad) out.skipped.damaged++
        else if ((await freeBytes()) !== null && (await freeBytes())! < u.bytes * 1.1) out.skipped.space++
        else out.skipped.failed++
        done += u.bytes
        onProgress(done, total)
    }
    return out
}
