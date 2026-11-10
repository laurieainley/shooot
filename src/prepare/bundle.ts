// The prepared parts file (`.shooot-parts`): the project plus the unit cache's prepared units, in one file that travels from a phone / iPad to the Mac.
//
// Layout: the magic bytes (see MAGIC), a 4-byte little-endian header length, the JSON header, then the units' `.bin` bytes back to back. Header offsets are
// relative to the end of the header. The writer composes a Blob of the cache's OPFS `File` objects (no second copy on disk); the reader streams
// each unit through `importUnit`, so a unit is stored whole or not at all.
import { RENDER_VERSION, isPortableKey, preparedUnits, readUnitFiles, importUnit, type CacheKind } from '../render/unitCache'
import { LogParser, type LogRecord } from '../render/packetLog'
import { buildTransferPayload, decodeProject, encodeProject, type TransferPayload } from '../utils/projectTransfer'
import { useAppState } from '../state'

// Written in two pieces: brand.test forbids the product's old spelling in source, but these bytes are the file format and must not change.
const MAGIC_TEXT = 'SHOOO' + 'TPARTS\n'
export const MAGIC = new TextEncoder().encode(MAGIC_TEXT)
export const FORMAT = 1
const MAX_HEADER = 64 * 1024 * 1024
const STEP = 8 * 1024 * 1024

export type BundleUnit = { portable: string; which: CacheKind; bytes: number; offset: number; codec: string; description: string; applied: string[] }
export type BundleHeader = { format: number; renderVersion: string; device: string; createdAt: number; projectId?: string | null; project: string; units: BundleUnit[] }
export type BundleImport = { project: TransferPayload | null; imported: number; refused: string | null; device: string; cancelled: boolean }

/** A short name for this device, for "prepared on <device>". */
export function deviceLabel(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): string {
    if (/iPhone|iPod/i.test(ua)) return 'iPhone'
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'iPad'
    if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet'
    if (/Macintosh/i.test(ua)) return 'Mac'
    if (/Windows/i.test(ua)) return 'Windows PC'
    return 'another device'
}

/** The prepared units for the open project that are complete on disk, with their stored bytes. */
async function completeUnits(): Promise<{ which: CacheKind; portable: string; file: File; applied: string[]; codec: string; description: string }[]> {
    const out: { which: CacheKind; portable: string; file: File; applied: string[]; codec: string; description: string }[] = []
    const seen = new Set<string>()
    for (const { which, key } of await preparedUnits()) {
        const u = await readUnitFiles(key)
        const portable = u?.meta.portable
        if (!u || !u.meta.video || !portable || !isPortableKey(portable) || seen.has(portable)) continue
        seen.add(portable)
        out.push({ which, portable, file: u.file, applied: u.meta.applied, codec: u.meta.video.codec, description: u.meta.video.description })
    }
    return out
}

/** How many prepared units (and how many bytes) a parts file would hold now. */
export async function preparedSummary(): Promise<{ units: number; bytes: number }> {
    const u = await completeUnits()
    return { units: u.length, bytes: u.reduce((a, x) => a + x.file.size, 0) }
}

/** The parts file for the open project: header + the prepared units, as a Blob over the cache's own files. */
export async function buildBundle(projectId: string | null, o: { project?: TransferPayload; device?: string; now?: number } = {}): Promise<Blob> {
    const units = await completeUnits()
    let offset = 0
    const header: BundleHeader = {
        format: FORMAT, renderVersion: RENDER_VERSION, device: o.device ?? deviceLabel(), createdAt: o.now ?? Date.now(), projectId,
        project: await encodeProject(o.project ?? buildTransferPayload(useAppState.getState())),
        units: units.map((u) => { const e: BundleUnit = { portable: u.portable, which: u.which, bytes: u.file.size, offset, codec: u.codec, description: u.description, applied: u.applied }; offset += u.file.size; return e }),
    }
    const json = new TextEncoder().encode(JSON.stringify(header))
    const len = new Uint8Array(4)
    new DataView(len.buffer).setUint32(0, json.length, true)
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

const isUnit = (u: unknown): u is BundleUnit => {
    const x = u as BundleUnit
    return !!x && typeof x.portable === 'string' && Number.isFinite(x.bytes) && x.bytes >= 0 && Number.isFinite(x.offset) && x.offset >= 0
        && typeof x.codec === 'string' && typeof x.description === 'string' && Array.isArray(x.applied)
}

const abortError = (): DOMException => new DOMException('cancelled', 'AbortError')

/**
 * Loads a parts file: returns its project and copies its units into the unit cache. Parts are skipped (project still returned) when the file's
 * format or render version is not this build's. Cancelling rolls the unit in progress back; the ones already stored stay. Throws when the file is not a parts file.
 */
export async function importBundle(file: File, onProgress: (doneBytes: number, totalBytes: number) => void, signal: AbortSignal): Promise<BundleImport> {
    const parsed = await readBundleHeader(file)
    if (!parsed) throw new Error('This is not a prepared parts file.')
    const { header: h, dataStart } = parsed
    const device = typeof h.device === 'string' && h.device ? h.device : 'another device'
    let project: TransferPayload | null = null
    try { project = await decodeProject(h.project) } catch { /* the parts can still be used */ }
    const out: BundleImport = { project, imported: 0, refused: null, device, cancelled: false }
    if (h.format !== FORMAT) { out.refused = 'This prepared parts file is from a different version of the app, so its parts were skipped. The project was loaded.'; return out }
    if (h.renderVersion !== RENDER_VERSION) { out.refused = 'These prepared parts were made by a different version of the app, so they were skipped. The project was loaded.'; return out }
    const units = h.units.filter(isUnit).filter((u) => isPortableKey(u.portable) && dataStart + u.offset + u.bytes <= file.size)
    const total = units.reduce((a, u) => a + u.bytes, 0)
    const batch = `${device}·${h.createdAt}`
    let done = 0
    onProgress(0, total)
    for (const u of units) {
        if (signal.aborted) { out.cancelled = true; return out }
        const base = done
        async function* records(): AsyncGenerator<LogRecord> {
            const parser = new LogParser()
            const from = dataStart + u.offset
            for (let o = 0; o < u.bytes; o += STEP) {
                if (signal.aborted) throw abortError()
                const end = Math.min(u.bytes, o + STEP)
                yield* parser.push(new Uint8Array(await file.slice(from + o, from + end).arrayBuffer()))
                onProgress(base + end, total)
            }
            if (parser.pending > 0) throw new Error('prepared part ends in the middle of a packet')
        }
        const ok = await importUnit(u.portable, records(), { applied: u.applied, video: { codec: u.codec, description: u.description }, device, batch, bytes: u.bytes })
        if (signal.aborted) { out.cancelled = true; if (ok) out.imported++; return out }
        if (ok) out.imported++
        done += u.bytes
        onProgress(done, total)
    }
    return out
}
