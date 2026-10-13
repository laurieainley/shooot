// The unit cache: finished render units (a title card, a stretch of one cut, the full-time card) kept in the browser's private
// storage (OPFS) after a re-encode (Highlights / Full match at 4K or 1080p), so the next export after a small edit reuses the
// units whose inputs did not change instead of encoding them again.
//
// A unit is stored as `<key>.bin` (its packet log, timestamps relative to the unit start) and `<key>.json` (the labels of the
// graphics it drew, the video sample entry, and the byte length of the log: written last, so it marks a complete unit). The key is
// a SHA-256 of EVERYTHING that decides the unit's packets: see `buildReuseKeys` (what the caller knows: footage, cut, graphics) and
// `unitFacts` in transcodeEngine.ts (what only the engine knows: size, rate, bitrate, encoder, key frames, audio).
// A wrong reuse is far worse than a miss, so anything unsure belongs in the key. A read problem anywhere is a miss.
import { LogParser, encodeRecord, type LogRecord } from './packetLog'
import { isSting, type GraphicsSpec, type OverlaySpec } from '../graphics/types'
import type { Cut, RenderSource } from './types'

/**
 * Changes whenever the code or assets that draw a unit change: the build fingerprints src/render, src/graphics and the fonts
 * (vite.config.ts `renderHash`), so a deploy never reuses parts rendered by older code. Bump the number for anything outside those.
 */
export const RENDER_VERSION = `1-${typeof __RENDER_HASH__ === 'string' ? __RENDER_HASH__ : 'dev'}`
export const CACHE_DIR = 'unit-cache'
/** Overall cap on the cache; also never more than this share of the site's quota. */
export const CACHE_CAP_BYTES = 6e9
export const CACHE_QUOTA_SHARE = 0.25
export type CacheKind = 'highlights' | 'fullMatch'

export const cacheCap = (quota: number | null): number => (quota ? Math.min(CACHE_CAP_BYTES, quota * CACHE_QUOTA_SHARE) : CACHE_CAP_BYTES)

/** JSON with sorted keys, so equal data always gives equal text. */
export function canonical(v: unknown): string {
    if (v === undefined) return 'null'
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

/** SHA-256 of the canonical form, 32 hex characters (128 bits). */
export async function digest(v: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(canonical(v))
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- what the caller knows: footage, cuts, graphics ----

/** What the editor tells the engine so it can name its units. All strings are canonical JSON (hashed by the engine together with its own facts). */
export type ReuseKeys = {
    which: CacheKind
    intro: string | null
    outro: string | null
    /** Everything that decides the pictures of output frames drawn from source seconds [a, b) of cut `ci` (index into the cuts of the render). */
    cut: (ci: number, a: number, b: number) => string
    /** The same for the whole cut: what the estimate and the manifest use. */
    wholeCut: (ci: number) => string
}

const identity = (s: RenderSource): { n: string; s: number; m: number } => ({ n: s.name, s: s.file.size, m: s.file.lastModified })
const stripCut = (o: OverlaySpec): Omit<OverlaySpec, 'cutIndex'> => { const { cutIndex: _c, ...rest } = o; return rest }
const overlaps = (o: OverlaySpec, a: number, b: number): boolean => o.startSec < b + 1e-3 && o.startSec + o.durationSec > a - 1e-3
/** Captions tied to the start or the end of their cut take their timing from the cut itself, so every part of it counts. */
const cutBound = (o: OverlaySpec): boolean => o.kind === 'caption' && (!!o.fromCutStart || !!o.toCutEnd)

/**
 * The reuse keys of a render. `logo`: a fingerprint of the logo picture ('default' for the bundled badge); `fonts`: the graphics look
 * version. Intro/outro cards carry their whole spec (the full-time card lists scorers, so it changes when they do).
 */
export function buildReuseKeys(o: { which: CacheKind; cuts: Cut[]; sources: RenderSource[]; spec: GraphicsSpec | undefined; quality: string; videoBitrate: number; logo: string }): ReuseKeys {
    const spec = o.spec
    const common = { v: RENDER_VERSION, theme: spec?.theme ?? null, logo: o.logo, quality: o.quality, bitrate: o.videoBitrate }
    const card = (c: unknown): string => canonical({ ...common, card: c })
    const overlaysOf = (ci: number): OverlaySpec[] => (spec?.overlays ?? []).filter((x) => x.cutIndex === ci)
    const cutPart = (ci: number): unknown => {
        const c = o.cuts[ci]
        if (!c) return null
        const { sourceIndex, ...rest } = c
        return { ...rest, src: o.sources[sourceIndex] ? identity(o.sources[sourceIndex]) : null }
    }
    const build = (ci: number, a: number, b: number, all: boolean): string => {
        const mine = overlaysOf(ci)
        const here = mine.filter((x) => all || cutBound(x) || overlaps(x, a, b)).map(stripCut)
        // A replay carries the caption of the clip before it on: that clip's cut and captions are inputs of the replay's first part.
        const carries = mine.some(cutBound)
        const before = carries ? { cut: cutPart(ci - 1), captions: overlaysOf(ci - 1).filter((x) => x.kind === 'caption').map(stripCut) } : null
        return canonical({ ...common, cut: cutPart(ci), overlays: here, before, gfx: !!spec })
    }
    return {
        which: o.which,
        intro: spec?.intro ? card({ intro: spec.intro }) : null,
        outro: spec?.outro ? card({ outro: spec.outro, sting: isSting(spec.outro) }) : null,
        cut: (ci, a, b) => build(ci, a, b, false),
        wholeCut: (ci) => build(ci, 0, 0, true),
    }
}

/** Fingerprint of the logo picture for the keys (hash of its bytes; 'default' for the bundled badge). */
export async function logoFingerprint(blob: Blob | null): Promise<string> {
    if (!blob) return 'default'
    try {
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
        return Array.from(h.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
    } catch { return `unreadable-${Date.now()}` } // unreadable = never matches
}

// ---- the store ----

export type UnitMeta = { applied: string[]; video: { codec: string; description: string } | null; bytes: number }
export type CachedUnit = { records: AsyncIterable<LogRecord>; meta: UnitMeta }
type Manifest = { v: 1; kinds: Partial<Record<CacheKind, { at: number; units: string[]; sections: { k: string; u: string[] }[] }>> }
export type CacheEntry = { key: string; bytes: number; at: number; order: number }

const b64 = (u: Uint8Array): string => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s) }
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export const encodeDescription = (d: unknown): string | null => (d instanceof Uint8Array ? b64(d) : d instanceof ArrayBuffer ? b64(new Uint8Array(d)) : ArrayBuffer.isView(d) ? b64(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) : null)
export const decodeDescription = unb64

type DirHandle = FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> }

async function cacheDir(create: boolean): Promise<DirHandle | null> {
    try {
        if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null
        return await (await navigator.storage.getDirectory()).getDirectoryHandle(CACHE_DIR, { create }) as DirHandle
    } catch { return null }
}

/** Which units to delete: everything no manifest refers to, then, while the rest is over `cap`, the least recently exported first (later units of a reel before earlier ones). Pure. */
export function planEviction(entries: CacheEntry[], keep: Set<string>, cap: number): string[] {
    const drop: string[] = entries.filter((e) => !keep.has(e.key)).map((e) => e.key)
    const kept = entries.filter((e) => keep.has(e.key)).sort((a, b) => a.at - b.at || b.order - a.order)
    let total = kept.reduce((s, e) => s + e.bytes, 0)
    for (const e of kept) {
        if (total <= cap) break
        drop.push(e.key)
        total -= e.bytes
    }
    return drop
}

/** Every complete unit in the store, with its size and when it was last part of an export. */
async function listEntries(dir: DirHandle, manifest: Manifest): Promise<CacheEntry[]> {
    const at = new Map<string, { at: number; order: number }>()
    for (const k of Object.values(manifest.kinds)) k?.units.forEach((u, i) => { const prev = at.get(u); if (!prev || prev.at < k.at) at.set(u, { at: k.at, order: i }) })
    const names = new Set<string>()
    if (dir.entries) for await (const [name, h] of dir.entries()) if (h.kind === 'file') names.add(name)
    const out: CacheEntry[] = []
    for (const name of names) {
        if (!name.endsWith('.json') || name === 'manifest.json') continue
        const key = name.slice(0, -5)
        if (!names.has(`${key}.bin`)) continue
        try {
            const bin = await (await dir.getFileHandle(`${key}.bin`)).getFile()
            out.push({ key, bytes: bin.size, at: at.get(key)?.at ?? 0, order: at.get(key)?.order ?? 0 })
        } catch { /* gone meanwhile */ }
    }
    return out
}

async function readManifest(dir: DirHandle): Promise<Manifest> {
    try {
        const m = JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text()) as Manifest
        if (m?.v === 1 && m.kinds) return m
    } catch { /* none yet */ }
    return { v: 1, kinds: {} }
}

async function writeManifest(dir: DirHandle, m: Manifest): Promise<void> {
    const w = await (await dir.getFileHandle('manifest.json', { create: true })).createWritable()
    await w.write(JSON.stringify(m))
    await w.close()
}

async function removeKeys(dir: DirHandle, keys: Iterable<string>): Promise<void> {
    for (const k of keys) {
        await dir.removeEntry(`${k}.json`).catch(() => undefined) // first: the marker of a complete unit
        await dir.removeEntry(`${k}.bin`).catch(() => undefined)
    }
}

/** Orphans: a `.bin` without its `.json` (an interrupted save). */
async function removeOrphans(dir: DirHandle): Promise<void> {
    if (!dir.entries) return
    const names = new Set<string>()
    for await (const [name, h] of dir.entries()) if (h.kind === 'file') names.add(name)
    for (const n of names) if (n.endsWith('.bin') && !names.has(`${n.slice(0, -4)}.json`)) await dir.removeEntry(n).catch(() => undefined)
}

/** Bytes the cache holds (what `storageRoom` counts as reclaimable). 0 when there is none or the browser cannot say. */
export async function unitCacheBytes(): Promise<number> {
    const dir = await cacheDir(false)
    if (!dir?.entries) return 0
    let total = 0
    try {
        for await (const [, h] of dir.entries()) if (h.kind === 'file') total += (await (h as FileSystemFileHandle).getFile()).size
    } catch { /* count what was read */ }
    return total
}

/** Deletes every cached unit. Never throws. */
export async function clearUnitCache(): Promise<void> {
    try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(CACHE_DIR, { recursive: true }).catch(() => undefined)
    } catch { /* no storage: nothing to clear */ }
}

/** Frees up to `need` bytes of site storage by evicting cached units, oldest first, sparing `spare` until nothing else is left. Returns bytes freed. */
export async function evictForRoom(need: number, spare: Set<string> = new Set()): Promise<number> {
    const dir = await cacheDir(false)
    if (!dir) return 0
    try {
        const { quota, usage } = await navigator.storage.estimate()
        if (!quota) return 0
        let deficit = need - (quota - (usage ?? 0))
        if (deficit <= 0) return 0
        const entries = await listEntries(dir, await readManifest(dir))
        const order = [...entries.filter((e) => !spare.has(e.key)).sort((a, b) => a.at - b.at || b.order - a.order), ...entries.filter((e) => spare.has(e.key)).sort((a, b) => a.at - b.at || b.order - a.order)]
        const drop: string[] = []
        let freed = 0
        for (const e of order) { if (deficit <= 0) break; drop.push(e.key); deficit -= e.bytes; freed += e.bytes }
        await removeKeys(dir, drop)
        return freed
    } catch { return 0 }
}

export type UnitStore = {
    /** Keys of the complete units in the store (one directory listing). */
    keys: () => Promise<Set<string>>
    load: (key: string) => Promise<CachedUnit | null>
    /** Stores a finished unit; false when it could not (no room, no storage). Never throws. */
    save: (key: string, records: AsyncIterable<LogRecord>, meta: Omit<UnitMeta, 'bytes'>) => Promise<boolean>
    remove: (key: string) => Promise<void>
    /** Free bytes the site has left (null = unknown). */
    free: () => Promise<number | null>
    /** Ends an export: the units it used become the kind's "last export", everything else goes, and the cap is applied. */
    finish: (kind: CacheKind, used: { units: string[]; sections: { k: string; u: string[] }[] }) => Promise<void>
}

export function opfsUnitStore(): UnitStore {
    const store: UnitStore = {
        async keys() {
            const dir = await cacheDir(false)
            const out = new Set<string>()
            if (!dir?.entries) return out
            try {
                for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.endsWith('.json') && name !== 'manifest.json') out.add(name.slice(0, -5))
            } catch { /* a listing problem = nothing reusable */ }
            return out
        },
        async load(key) {
            try {
                const dir = await cacheDir(false)
                if (!dir) return null
                const meta = JSON.parse(await (await (await dir.getFileHandle(`${key}.json`)).getFile()).text()) as UnitMeta
                const file = await (await dir.getFileHandle(`${key}.bin`)).getFile()
                if (!Array.isArray(meta.applied) || file.size !== meta.bytes) return null // a size that disagrees = a damaged unit
                async function* records(): AsyncGenerator<LogRecord> {
                    const parser = new LogParser()
                    const STEP = 8 * 1024 * 1024
                    for (let o = 0; o < file.size; o += STEP) yield* parser.push(new Uint8Array(await file.slice(o, Math.min(file.size, o + STEP)).arrayBuffer()))
                    if (parser.pending > 0) throw new Error('cached unit ends in the middle of a packet')
                }
                return { records: records(), meta }
            } catch { return null }
        },
        async save(key, records, meta) {
            const dir = await cacheDir(true)
            if (!dir) return false
            try {
                let bytes = 0
                const w = await (await dir.getFileHandle(`${key}.bin`, { create: true })).createWritable()
                try {
                    for await (const r of records) { const e = encodeRecord(r); bytes += e.byteLength; await w.write(e) }
                    await w.close()
                } catch (e) { await w.abort().catch(() => undefined); throw e }
                const j = await (await dir.getFileHandle(`${key}.json`, { create: true })).createWritable()
                await j.write(JSON.stringify({ ...meta, bytes } satisfies UnitMeta))
                await j.close()
                return true
            } catch {
                await removeKeys(dir, [key])
                return false
            }
        },
        async remove(key) {
            const dir = await cacheDir(false)
            if (dir) await removeKeys(dir, [key])
        },
        async free() {
            try {
                const { quota, usage } = await navigator.storage.estimate()
                return quota ? Math.max(0, quota - (usage ?? 0)) : null
            } catch { return null }
        },
        async finish(kind, used) {
            try {
                const dir = await cacheDir(true)
                if (!dir) return
                const manifest = await readManifest(dir)
                manifest.kinds[kind] = { at: Date.now(), units: used.units, sections: used.sections }
                const keep = new Set<string>(Object.values(manifest.kinds).flatMap((k) => k?.units ?? []))
                let quota: number | null = null
                try { quota = (await navigator.storage.estimate()).quota ?? null } catch { /* unknown quota */ }
                const drop = planEviction(await listEntries(dir, manifest), keep, cacheCap(quota))
                await removeKeys(dir, drop)
                await removeOrphans(dir)
                // A section whose units were evicted can no longer be reused.
                const gone = new Set(drop)
                for (const k of Object.values(manifest.kinds)) if (k) { k.units = k.units.filter((u) => !gone.has(u)); k.sections = k.sections.filter((s) => s.u.every((u) => !gone.has(u))) }
                await writeManifest(dir, manifest)
            } catch { /* the cache is an extra: never fail an export over it */ }
        },
    }
    return store
}

// ---- for the estimate ----

export type ReusableParts = { intro: boolean; outro: boolean; cuts: boolean[] }

/** Which parts of a plan the last export of this kind left in the cache (cheap: the manifest and one directory listing). Nothing reusable on any problem. */
export async function reusableParts(which: CacheKind, keys: ReuseKeys, cutCount: number): Promise<ReusableParts> {
    const none: ReusableParts = { intro: false, outro: false, cuts: Array.from({ length: cutCount }, () => false) }
    try {
        const dir = await cacheDir(false)
        if (!dir) return none
        const kind = (await readManifest(dir)).kinds[which]
        if (!kind || kind.sections.length === 0) return none
        const have = await opfsUnitStore().keys()
        const ok = new Set(kind.sections.filter((s) => s.u.every((u) => have.has(u))).map((s) => s.k))
        return {
            intro: !!keys.intro && ok.has(await digest(keys.intro)),
            outro: !!keys.outro && ok.has(await digest(keys.outro)),
            cuts: await Promise.all(Array.from({ length: cutCount }, async (_, ci) => ok.has(await digest(keys.wholeCut(ci))))),
        }
    } catch { return none }
}
