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

/** The most of the site's quota that prepared units may take (the rest is for the export that builds on them and everything else on the site). */
export const PREPARED_QUOTA_SHARE = 0.9
/** The cap with prepared units: whatever the preparer admitted (it checked that it fits), never below the normal cap, never past most of the quota. */
export const capFor = (quota: number | null, budgets: number): number => {
    const base = cacheCap(quota)
    return Math.max(base, quota ? Math.min(budgets, quota * PREPARED_QUOTA_SHARE) : budgets)
}

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
    /**
     * A block on the source's frame grid (transcodePlan gridSegments) of a normal-speed cut: its pictures and audio come from source
     * seconds [a, b) alone, so the key holds the footage, the cut's treatment (crop, silence) and the graphics drawn in [a, b) — NOT
     * where the cut starts or ends, nor any overlay that draws elsewhere. A caption tied to the cut's start or end draws only inside its
     * own window, and counts (with the cut's real edges) only for the blocks that window touches.
     */
    block: (ci: number, a: number, b: number) => string
    /** The same keys with a device-independent footage identity (see buildReuseKeys `fingerprints`); absent when a source has no print. */
    portable?: PortableReuseKeys
}

type Identity = (s: RenderSource, i: number) => unknown
const identity: Identity = (s) => ({ n: s.name, s: s.file.size, m: s.file.lastModified })
const stripCut = (o: OverlaySpec): Omit<OverlaySpec, 'cutIndex'> => { const { cutIndex: _c, ...rest } = o; return rest }
const overlaps = (o: OverlaySpec, a: number, b: number): boolean => o.startSec < b + 1e-3 && o.startSec + o.durationSec > a - 1e-3
/** Captions tied to the start or the end of their cut take their timing from the cut itself, so every part of it counts. */
const cutBound = (o: OverlaySpec): boolean => o.kind === 'caption' && (!!o.fromCutStart || !!o.toCutEnd)
/** Where an overlay can draw in a block's frames: its window, and for a cut-bound caption up to its whole clock (the engine may stretch it to the cut's real end). */
const reach = (o: OverlaySpec): number => o.durationSec + (cutBound(o) && o.kind === 'caption' ? Math.max(0, o.clock.totalSec - o.durationSec) : 0)
const touches = (o: OverlaySpec, a: number, b: number): boolean => o.startSec < b + 1e-3 && o.startSec + reach(o) > a - 1e-3

/** The device-independent half of the reuse keys (see `ReuseKeys.portable`). */
export type PortableReuseKeys = Omit<ReuseKeys, 'which' | 'portable'>
type BuildInput = { which: CacheKind; cuts: Cut[]; sources: RenderSource[]; spec: GraphicsSpec | undefined; quality: string; videoBitrate: number; logo: string }

/**
 * The reuse keys of a render. `logo`: a fingerprint of the logo picture ('default' for the bundled badge, 'none' for no logo); `fonts`: the graphics look
 * version. Intro/outro cards carry their whole spec (the full-time card lists scorers, so it changes when they do).
 * `fingerprints` (one per source, `footageFingerprint`): with one for every source a cut uses, the keys also get a `portable` half whose footage
 * identity is size + content print instead of name + modified time, which another device or OS may not keep.
 */
export function buildReuseKeys(o: BuildInput & { fingerprints?: (string | null)[] }): ReuseKeys {
    const fps = o.fingerprints
    const printed = !!fps && o.cuts.every((c) => typeof fps[c.sourceIndex] === 'string' && fps[c.sourceIndex]!.length > 0)
    // No name: iOS may rename a copy ("GX010042 2.MP4"); size + content print say which footage it is.
    const portable = printed ? partKeys(o, (s, i) => ({ s: s.file.size, fp: fps![i] }), true) : undefined
    return { which: o.which, ...partKeys(o, identity, false), ...(portable ? { portable } : {}) }
}

function partKeys(o: BuildInput, id: Identity, portable: boolean): PortableReuseKeys {
    const spec = o.spec
    const common = { v: RENDER_VERSION, theme: spec?.theme ?? null, logo: o.logo, quality: o.quality, bitrate: o.videoBitrate, ...(portable ? { portable: 1 } : {}) }
    const src = (i: number): unknown => (o.sources[i] ? id(o.sources[i], i) : null)
    const card = (c: unknown): string => canonical({ ...common, card: c })
    const overlaysOf = (ci: number): OverlaySpec[] => (spec?.overlays ?? []).filter((x) => x.cutIndex === ci)
    const cutPart = (ci: number): unknown => {
        const c = o.cuts[ci]
        if (!c) return null
        const { sourceIndex, ...rest } = c
        return { ...rest, src: src(sourceIndex) }
    }
    const build = (ci: number, a: number, b: number, all: boolean): string => {
        const mine = overlaysOf(ci)
        const here = mine.filter((x) => all || cutBound(x) || overlaps(x, a, b)).map(stripCut)
        // A replay carries the caption of the clip before it on: that clip's cut and captions are inputs of the replay's first part.
        const carries = mine.some(cutBound)
        const before = carries ? { cut: cutPart(ci - 1), captions: overlaysOf(ci - 1).filter((x) => x.kind === 'caption').map(stripCut) } : null
        return canonical({ ...common, cut: cutPart(ci), overlays: here, before, gfx: !!spec })
    }
    /** Everything that decides a grid block's pictures and audio (see ReuseKeys.block). */
    const block = (ci: number, a: number, b: number): string => {
        const c = o.cuts[ci]
        const mine = overlaysOf(ci)
        const here = mine.filter((x) => touches(x, a, b))
        // Only a cut-bound caption drawn in this block ties it to the cut's edges (and to the clip before, whose caption a replay carries on).
        const bound = here.some(cutBound)
        const treatment = c ? { speed: c.speed ?? 1, crop: c.crop ?? null, silent: !!c.silent, gain: c.gain ?? 1 } : null
        const edges = bound && c ? { start: c.startSec, end: c.endSec } : null
        const before = bound ? { cut: cutPart(ci - 1), captions: overlaysOf(ci - 1).filter((x) => x.kind === 'caption').map(stripCut) } : null
        return canonical({ ...common, grid: [a, b], src: c ? src(c.sourceIndex) : null, treatment, edges, overlays: here.map(stripCut), before, gfx: !!spec })
    }
    return {
        block,
        intro: spec?.intro ? card({ intro: spec.intro }) : null,
        outro: spec?.outro ? card({ outro: spec.outro, sting: isSting(spec.outro) }) : null,
        cut: (ci, a, b) => build(ci, a, b, false),
        wholeCut: (ci) => build(ci, 0, 0, true),
    }
}

/** What the engine adds to a unit's key (`unitFacts` in transcodeEngine.ts). */
export type UnitKeyInput = { facts: Record<string, unknown>; kind: string; frames: number; part: unknown }
/** The facts that are the same on any device making the same output: `unitFacts` without the encoder and the scale path. */
export const portableFacts = (f: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'encoder' && k !== 'scale'))
/**
 * The portable key of a unit: what another device that renders the same output calls it. Its `part` must come from `ReuseKeys.portable`.
 * Kept in every cached unit's meta and the name an imported unit is stored under.
 */
export const portableKey = (i: UnitKeyInput): Promise<string> => digest({ portable: 1, facts: portableFacts(i.facts), kind: i.kind, frames: i.frames, part: i.part })
export const isPortableKey = (k: string): boolean => /^[0-9a-f]{32}$/.test(k)

const MiB = 1024 * 1024
const prints = new Map<string, Promise<string>>()
/**
 * A content print of a footage file that survives copies and other OSes: SHA-256 (hex) of its first and last MiB (the whole file when smaller).
 * Read once per name + size + modified time in a session.
 */
export function footageFingerprint(file: File): Promise<string> {
    const id = `${file.name}\u0000${file.size}\u0000${file.lastModified}`
    let p = prints.get(id)
    if (!p) {
        p = (async () => {
            const head = Math.min(file.size, MiB)
            const parts = [new Uint8Array(await file.slice(0, head).arrayBuffer())]
            const tail = Math.max(head, file.size - MiB)
            if (tail < file.size) parts.push(new Uint8Array(await file.slice(tail, file.size).arrayBuffer()))
            const all = new Uint8Array(parts.reduce((a, x) => a + x.byteLength, 0))
            let o = 0
            for (const x of parts) { all.set(x, o); o += x.byteLength }
            const h = new Uint8Array(await crypto.subtle.digest('SHA-256', all))
            return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')
        })()
        prints.set(id, p)
        p.catch(() => prints.delete(id)) // a read problem may pass: try again next time
    }
    return p
}

/** Fingerprint of the logo picture for the keys (hash of its bytes; 'default' for the bundled badge). */
export async function logoFingerprint(blob: Blob | 'none' | null): Promise<string> {
    if (blob === 'none') return 'none'
    if (!blob) return 'default'
    try {
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
        return Array.from(h.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
    } catch { return `unreadable-${Date.now()}` } // unreadable = never matches
}

// ---- the store ----

/**
 * `portable`: the unit's portable key (what another device calls it). `imported`: it came from another device (a prepared parts file) and is stored
 * under its portable key; `device` names that device for the diagnostics.
 */
export type UnitMeta = { applied: string[]; video: { codec: string; description: string } | null; bytes: number; portable?: string; imported?: true; device?: string }
export type CachedUnit = { records: AsyncIterable<LogRecord>; meta: UnitMeta }
/**
 * `kinds`: the units of each kind's last export. `prepared`: the units the background preparer is keeping for the plan as it stands
 * (every key of the plan, finished or not yet, so a unit saved a moment ago is never taken for an orphan), with the bytes it expects
 * them to take: the cache may grow to that (see capFor).
 */
type Manifest = {
    v: 1
    kinds: Partial<Record<CacheKind, { at: number; units: string[]; sections: { k: string; u: string[] }[] }>>
    prepared?: Partial<Record<CacheKind, { at: number; units: string[]; budget: number }>>
    /**
     * The units of the last prepared parts file loaded from another device (`bytes[i]` is the size of `units[i]`; `batch` names the file). Never evicted,
     * and allowed past the normal cap, until a newer file is loaded, the saved parts are cleared, or they are IMPORTED_KEEP_MS old.
     */
    imported?: { batch: string; at: number; units: string[]; bytes: number[] }
}
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

/**
 * Which units to delete: everything no manifest refers to, then, while the rest is over `cap`, the least recently exported first (later units of a reel
 * before earlier ones). `pinned` units (imported from another device) are never dropped: they cannot be made again here. Pure.
 */
export function planEviction(entries: CacheEntry[], keep: Set<string>, cap: number, pinned: Set<string> = new Set()): string[] {
    const drop: string[] = entries.filter((e) => !keep.has(e.key) && !pinned.has(e.key)).map((e) => e.key)
    const kept = entries.filter((e) => keep.has(e.key) || pinned.has(e.key))
    let total = kept.reduce((s, e) => s + e.bytes, 0)
    for (const e of kept.filter((x) => !pinned.has(x.key)).sort((a, b) => a.at - b.at || b.order - a.order)) {
        if (total <= cap) break
        drop.push(e.key)
        total -= e.bytes
    }
    return drop
}

/** Every complete unit in the store, with its size and when it was last part of an export. */
async function listEntries(dir: DirHandle, manifest: Manifest): Promise<CacheEntry[]> {
    const at = new Map<string, { at: number; order: number }>()
    const imp = liveImport(manifest)
    for (const k of [...Object.values(manifest.kinds), ...Object.values(manifest.prepared ?? {}), ...(imp ? [imp] : [])]) k?.units.forEach((u, i) => { const prev = at.get(u); if (!prev || prev.at < k.at) at.set(u, { at: k.at, order: i }) })
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

/** How long parts loaded from another device are kept (unless a newer parts file replaces them first). */
export const IMPORTED_KEEP_MS = 14 * 24 * 3600 * 1000
/** The imported parts still kept (none once they are IMPORTED_KEEP_MS old). */
const liveImport = (m: Manifest): Manifest['imported'] | null => (m.imported && Date.now() - m.imported.at <= IMPORTED_KEEP_MS ? m.imported : null)
/** Units the last exports or the preparer's plans refer to. */
const plannedOf = (m: Manifest): Set<string> => new Set<string>([...Object.values(m.kinds), ...Object.values(m.prepared ?? {})].flatMap((k) => k?.units ?? []))
/** Every unit some manifest entry refers to (last exports, the preparer's plans and imported units). */
const keepSetOf = (m: Manifest): Set<string> => new Set<string>([...plannedOf(m), ...importedOf(m)])
const budgetsOf = (m: Manifest): number => Object.values(m.prepared ?? {}).reduce((a, p) => a + (p?.budget ?? 0), 0) + (liveImport(m)?.bytes ?? []).reduce((x, y) => x + y, 0)
/** Imported units: pinned, never evicted (they cannot be made again here). */
const importedOf = (m: Manifest): Set<string> => new Set(liveImport(m)?.units ?? [])

/** One manifest writer at a time (the engine, the preparer and an import may all write it): each read-modify-write waits for the one before. */
let manifestQueue: Promise<unknown> = Promise.resolve()
function withManifest<T>(fn: () => Promise<T>): Promise<T> {
    const run = manifestQueue.then(fn)
    manifestQueue = run.catch(() => undefined)
    return run
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
    try { await w.write(JSON.stringify(m)); await w.close() } catch (e) { await w.abort().catch(() => undefined); throw e }
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
        const manifest = await readManifest(dir)
        const imported = importedOf(manifest)
        // Imported units go last (they cannot be made again here), and one this render will use never.
        const entries = (await listEntries(dir, manifest)).filter((e) => !(spare.has(e.key) && imported.has(e.key)))
        const by = (a: CacheEntry, b: CacheEntry): number => a.at - b.at || b.order - a.order
        const plain = entries.filter((e) => !imported.has(e.key))
        const order = [...plain.filter((e) => !spare.has(e.key)).sort(by), ...plain.filter((e) => spare.has(e.key)).sort(by), ...entries.filter((e) => imported.has(e.key)).sort(by)]
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
    /** True when the cache can take `extra` more bytes without passing its cap. */
    hasRoomFor: (extra: number) => Promise<boolean>
    /** Ends a cancelled or failed export: the units it saved that no "last export" uses go, and the cap is applied. Never throws. */
    trim: () => Promise<void>
    /** Free bytes the site has left (null = unknown). */
    free: () => Promise<number | null>
    /** Ends an export: the units it used become the kind's "last export", everything else goes, and the cap is applied. */
    finish: (kind: CacheKind, used: { units: string[]; sections: { k: string; u: string[] }[] }) => Promise<void>
    /** The preparer's plan for a kind: `keys` are protected from eviction (finished or not); `budget` is the bytes the cache may grow to for them. null = no plan any more. Never throws. */
    prepare: (kind: CacheKind, plan: { keys: string[]; budget: number } | null) => Promise<void>
    /** The unit imported from another device under this portable key; null when there is none (or it is damaged). Never throws. */
    findPortable: (portable: string) => Promise<CachedUnit | null>
    /** Stores a unit prepared on another device (see `importUnit`). */
    importUnit: (portable: string, records: AsyncIterable<LogRecord>, meta: ImportMeta) => Promise<boolean>
}

/**
 * What a prepared parts file says about one unit: the device that made it, its size (checked against the free space), and `batch`, which names the
 * file it came from: loading a different file releases the previous file's parts.
 */
export type ImportMeta = { applied: string[]; video: { codec: string; description: string }; device: string; batch: string; bytes: number }

/**
 * Stores a unit prepared on another device under its portable key, marked imported (with the device's name). Admitted past the normal cap when the
 * site has room for `bytes`; kept until a newer parts file (another `batch`) is loaded, the saved parts are cleared, or IMPORTED_KEEP_MS pass.
 * False when it could not be kept: a bad key, no room, or the records stopped part-way (nothing is left behind then). Never throws.
 */
export function importUnit(portable: string, records: AsyncIterable<LogRecord>, meta: ImportMeta): Promise<boolean> {
    return opfsUnitStore().importUnit(portable, records, meta)
}

export function opfsUnitStore(): UnitStore {
    const quotaNow = async (): Promise<number | null> => { try { return (await navigator.storage.estimate()).quota ?? null } catch { return null } }
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
                try { await j.write(JSON.stringify({ ...meta, bytes } satisfies UnitMeta)); await j.close() } catch (e) { await j.abort().catch(() => undefined); throw e }
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
        async hasRoomFor(extra) {
            const quota = await quotaNow()
            try {
                const dir = await cacheDir(false)
                if (!dir) return true
                const manifest = await readManifest(dir)
                const keep = keepSetOf(manifest)
                // The previous exports' parts are dropped when this export ends unless it reuses them, so only the parts saved since count.
                const fresh = (await listEntries(dir, manifest)).filter((e) => !keep.has(e.key)).reduce((a, e) => a + e.bytes, 0)
                return fresh + extra <= capFor(quota, budgetsOf(manifest))
            } catch { return false }
        },
        trim: () => withManifest(async () => {
            try {
                const dir = await cacheDir(false)
                if (!dir) return
                const manifest = await readManifest(dir)
                await removeKeys(dir, planEviction(await listEntries(dir, manifest), keepSetOf(manifest), capFor(await quotaNow(), budgetsOf(manifest)), importedOf(manifest)))
                await removeOrphans(dir)
            } catch { /* nothing to trim */ }
        }),
        async free() {
            try {
                const { quota, usage } = await navigator.storage.estimate()
                return quota ? Math.max(0, quota - (usage ?? 0)) : null
            } catch { return null }
        },
        prepare: (kind, plan) => withManifest(async () => {
            try {
                const dir = await cacheDir(true)
                if (!dir) return
                const manifest = await readManifest(dir)
                const prepared = { ...(manifest.prepared ?? {}) }
                if (plan) prepared[kind] = { at: Date.now(), units: plan.keys, budget: plan.budget }
                else delete prepared[kind]
                manifest.prepared = prepared
                await writeManifest(dir, manifest)
            } catch { /* the cache is an extra */ }
        }),
        finish: (kind, used) => withManifest(async () => {
            try {
                const dir = await cacheDir(true)
                if (!dir) return
                const manifest = await readManifest(dir)
                manifest.kinds[kind] = { at: Date.now(), units: used.units, sections: used.sections }
                if (manifest.imported && !liveImport(manifest)) delete manifest.imported // past IMPORTED_KEEP_MS: ordinary parts now
                const drop = planEviction(await listEntries(dir, manifest), keepSetOf(manifest), capFor(await quotaNow(), budgetsOf(manifest)), importedOf(manifest))
                await removeKeys(dir, drop)
                await removeOrphans(dir)
                // A section whose units were evicted can no longer be reused.
                const gone = new Set(drop)
                for (const k of Object.values(manifest.kinds)) if (k) { k.units = k.units.filter((u) => !gone.has(u)); k.sections = k.sections.filter((s) => s.u.every((u) => !gone.has(u))) }
                await writeManifest(dir, manifest)
            } catch { /* the cache is an extra: never fail an export over it */ }
        }),
        async findPortable(portable) {
            if (!isPortableKey(portable)) return null
            const hit = await store.load(portable)
            return hit && hit.meta.imported === true && hit.meta.portable === portable ? hit : null
        },
        // The whole import of a unit holds the manifest: no trim can take its half-written file for an orphan meanwhile.
        importUnit: (portable, records, meta) => withManifest(async () => {
            if (!isPortableKey(portable) || !(meta.bytes >= 0)) return false
            const dir = await cacheDir(true)
            if (!dir) return false
            /** Puts the unit in (with its size) or takes it out of (null) the imported list. A different batch first releases the previous file's parts. */
            const mark = async (bytes: number | null): Promise<void> => {
                const m = await readManifest(dir)
                let prev = liveImport(m) ?? null
                if (prev && prev.batch !== meta.batch) {
                    // A newer parts file: the previous one's parts go, except those a last export or the preparer's plan still uses.
                    const planned = plannedOf(m)
                    await removeKeys(dir, prev.units.filter((u) => !planned.has(u)))
                    prev = null
                }
                const i = (prev ? prev.units.map((u, j) => [u, prev!.bytes[j] ?? 0] as const) : []).filter(([u]) => u !== portable)
                if (bytes !== null) i.push([portable, bytes])
                if (i.length > 0) m.imported = { batch: meta.batch, at: prev?.at ?? Date.now(), units: i.map(([u]) => u), bytes: i.map(([, b]) => b) }
                else delete m.imported
                await writeManifest(dir, m)
            }
            try {
                const free = await store.free()
                if (free !== null && free < meta.bytes * 1.1) return false
                await mark(meta.bytes)
                const ok = await store.save(portable, records, { applied: meta.applied, video: meta.video, portable, imported: true, device: meta.device })
                if (!ok) { await mark(null); return false }
                await mark((await (await dir.getFileHandle(`${portable}.bin`)).getFile()).size)
                return true
            } catch {
                await removeKeys(dir, [portable])
                await mark(null).catch(() => undefined)
                return false
            }
        }),
    }
    return store
}

/** A complete cached unit as it lies on disk: its stored meta and the `.bin` file itself (not read: for composing a prepared parts file). null when it is missing or damaged. */
export async function readUnitFiles(key: string): Promise<{ meta: UnitMeta; file: File } | null> {
    try {
        const dir = await cacheDir(false)
        if (!dir) return null
        const meta = JSON.parse(await (await (await dir.getFileHandle(`${key}.json`)).getFile()).text()) as UnitMeta
        const file = await (await dir.getFileHandle(`${key}.bin`)).getFile()
        return Array.isArray(meta.applied) && file.size === meta.bytes ? { meta, file } : null
    } catch { return null }
}

/** The keys of the units the preparer is keeping for each kind (finished or not yet: check with `readUnitFiles`). Never throws. */
export async function preparedUnits(): Promise<{ which: CacheKind; key: string }[]> {
    try {
        const dir = await cacheDir(false)
        if (!dir) return []
        const m = await readManifest(dir)
        return (Object.entries(m.prepared ?? {}) as [CacheKind, { units: string[] }][]).flatMap(([which, p]) => p.units.map((key) => ({ which, key })))
    } catch { return [] }
}

// ---- diagnostics ----

/** "Reused 4 parts prepared on iPhone, 3 encoded here" (several devices: "Reused 4 parts prepared on iPhone, 2 on iPad, …"). */
export function importedNote(from: Map<string, number>, encodedHere: number): string {
    const parts = [...from.entries()].map(([d, n], i) => (i === 0 ? `${n} part${n === 1 ? '' : 's'} prepared on ${d}` : `${n} on ${d}`))
    return `Reused ${parts.join(', ')}, ${encodedHere} encoded here`
}

// ---- for the estimate ----

export type ReusableParts = { intro: boolean; outro: boolean; /** true / false, or the share (0..1) of the cut's units that are cached */ cuts: (boolean | number)[] }

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
