import { afterEach, describe, expect, it, vi } from 'vitest'
import { opfsUnitStore, importUnit, RENDER_VERSION } from '../render/unitCache'
import type { LogRecord } from '../render/packetLog'
import { buildBundle, importBundle, preparedSummary, readBundleHeader, readBundleProject, MAGIC, type BundleHeader } from './bundle'
import type { TransferPayload } from '../utils/projectTransfer'

const MAGIC_TEXT = 'shooot-parts\n'

// A small in-memory OPFS (same idea as render/unitCache.import.test.ts); getFile hands out the same File object per read so identity can be checked.
type FileNode = { kind: 'file'; chunks: Uint8Array[]; handed: File[] }
type DirNode = { kind: 'directory'; kids: Map<string, FileNode | DirNode> }
const dir = (): DirNode => ({ kind: 'directory', kids: new Map() })
const toBytes = (d: unknown): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d as ArrayBuffer))
const fileHandle = (n: FileNode): unknown => ({
    kind: 'file',
    getFile: async () => { const f = new File(n.chunks as BlobPart[], 'x'); n.handed.push(f); return f },
    createWritable: async () => {
        const staged: Uint8Array[] = []
        return { write: async (d: unknown) => { staged.push(toBytes(d)) }, close: async () => { n.chunks = staged }, abort: async () => undefined }
    },
})
const dirHandle = (n: DirNode): unknown => ({
    kind: 'directory',
    entries: async function* () { for (const [k, v] of [...n.kids]) yield [k, v.kind === 'file' ? fileHandle(v) : dirHandle(v)] },
    getDirectoryHandle: async (k: string, o?: { create?: boolean }) => {
        let c = n.kids.get(k)
        if (!c) { if (!o?.create) throw new DOMException('nf', 'NotFoundError'); c = dir(); n.kids.set(k, c) }
        return dirHandle(c as DirNode)
    },
    getFileHandle: async (k: string, o?: { create?: boolean }) => {
        let c = n.kids.get(k)
        if (!c) { if (!o?.create) throw new DOMException('nf', 'NotFoundError'); c = { kind: 'file', chunks: [], handed: [] }; n.kids.set(k, c) }
        return fileHandle(c as FileNode)
    },
    removeEntry: async (k: string) => { if (!n.kids.delete(k)) throw new DOMException('nf', 'NotFoundError') },
})
const install = (): DirNode => {
    const root = dir()
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad)', storage: { getDirectory: async () => dirHandle(root), estimate: async () => ({ quota: 1e12, usage: 0 }) } })
    return root
}
const wipe = (root: DirNode): void => { root.kids.clear() }
afterEach(() => vi.unstubAllGlobals())

const P1 = 'a'.repeat(32)
const P2 = 'b'.repeat(32)
const L1 = '1'.repeat(64) // local keys
const L2 = '2'.repeat(64)
const rec = (i: number): LogRecord => ({ track: 0, key: i === 0, timestamp: i / 30, duration: 1 / 30, data: new Uint8Array([i, i + 1, i + 2]) })
async function* records(n: number): AsyncGenerator<LogRecord> { for (let i = 0; i < n; i++) yield rec(i) }
const collect = async (it: AsyncIterable<LogRecord>): Promise<LogRecord[]> => { const out: LogRecord[] = []; for await (const r of it) out.push(r); return out }
const video = { codec: 'avc1.640033', description: 'AAEC' }
const project = { events: [], teams: [{ name: 'A' }, { name: 'B' }] } as unknown as TransferPayload

async function prepared(): Promise<void> {
    const store = opfsUnitStore()
    await store.save(L1, records(3), { applied: ['Goal'], video, portable: P1 })
    await store.save(L2, records(5), { applied: [], video, portable: P2 })
    await store.prepare('fullMatch', { keys: [L1, 'f'.repeat(64)], budget: 1000 }) // the second is planned but not finished
    await store.prepare('highlights', { keys: [L2], budget: 1000 })
}
const opts = { project, device: 'Pixel', now: 1700000000000 }

describe('prepared parts file', () => {
    it('should write a header that round-trips and unit offsets that point at each unit\'s bytes', async () => {
        const root = install()
        await prepared()
        const blob = await buildBundle('p', opts)
        const file = new File([blob], 'x.shooot-parts')
        const head = await readBundleHeader(file)
        expect(head).not.toBeNull()
        expect(head!.header.format).toBe(1)
        expect(head!.header.renderVersion).toBe(RENDER_VERSION)
        expect(head!.header.device).toBe('Pixel')
        expect(head!.header.createdAt).toBe(1700000000000)
        expect(head!.header.units.map((u) => [u.portable, u.which]).sort()).toEqual([[P1, 'fullMatch'], [P2, 'highlights']])
        const u1 = head!.header.units.find((u) => u.portable === P1)!
        expect(u1).toMatchObject({ codec: video.codec, description: video.description, applied: ['Goal'] })
        const unitFile = await ((await (root.kids.get('unit-cache') as DirNode).kids.get(`${L1}.bin`)) as FileNode).chunks
        const want = new Uint8Array(await new Blob(unitFile as BlobPart[]).arrayBuffer())
        expect(u1.bytes).toBe(want.length)
        const got = new Uint8Array(await file.slice(head!.dataStart + u1.offset, head!.dataStart + u1.offset + u1.bytes).arrayBuffer())
        expect(Array.from(got)).toEqual(Array.from(want))
        expect(new TextDecoder().decode(new Uint8Array(await file.slice(0, MAGIC.length).arrayBuffer()))).toBe(MAGIC_TEXT)
        expect(file.size).toBe(head!.dataStart + head!.header.units.reduce((a, u) => a + u.bytes, 0))
    })
    it('should compose the Blob from the cache\'s own File objects (no second copy)', async () => {
        const root = install()
        await prepared()
        let parts: unknown[] = []
        const Real = Blob
        vi.stubGlobal('Blob', class extends Real { constructor(p?: BlobPart[], o?: BlobPropertyBag) { super(p, o); if (p && p.length > 2) parts = p } })
        await buildBundle('p', opts)
        const handed = [...((root.kids.get('unit-cache') as DirNode).kids.entries())].flatMap(([k, v]) => (k.endsWith('.bin') && v.kind === 'file' ? (v as FileNode).handed : []))
        const files = parts.filter((p): p is File => p instanceof File)
        expect(files.length).toBe(2)
        expect(files.every((f) => handed.includes(f))).toBe(true)
    })
    it('should import the units and return the project, the device and the count', async () => {
        const root = install()
        await prepared()
        const file = new File([await buildBundle('p', opts)], 'x')
        wipe(root)
        const seen: number[] = []
        const r = await importBundle(file, (d, t) => seen.push(d / t), new AbortController().signal)
        expect(r).toMatchObject({ imported: 2, refused: null, device: 'Pixel' })
        expect(r.project?.teams).toHaveLength(2)
        expect(seen.at(-1)).toBe(1)
        const hit = await opfsUnitStore().findPortable(P1)
        expect(hit!.meta).toMatchObject({ imported: true, device: 'Pixel', applied: ['Goal'], video })
        expect((await collect(hit!.records)).map((x) => Array.from(x.data))).toEqual([[0, 1, 2], [1, 2, 3], [2, 3, 4]])
        expect((await collect((await opfsUnitStore().findPortable(P2))!.records)).length).toBe(5)
    })
    it('should refuse the parts of another render version but still return the project', async () => {
        const root = install()
        await prepared()
        const bytes = new Uint8Array(await (await buildBundle('p', opts)).arrayBuffer())
        const text = new TextDecoder().decode(bytes)
        expect(text).toContain(RENDER_VERSION)
        const head = await readBundleHeader(new File([bytes], 'x'))
        const changed = JSON.stringify({ ...head!.header, renderVersion: '0-old' })
        const enc = new TextEncoder().encode(changed)
        const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, enc.length, true)
        const old = new File([new TextEncoder().encode(MAGIC_TEXT), len, enc, bytes.slice(head!.dataStart)], 'x')
        wipe(root)
        const r = await importBundle(old, () => undefined, new AbortController().signal)
        expect(r.imported).toBe(0)
        expect(r.refused).toMatch(/different version/i)
        expect(r.project?.teams).toHaveLength(2)
        expect(await opfsUnitStore().findPortable(P1)).toBeNull()
    })
    it('should refuse another format the same way and reject a file that is not a parts file', async () => {
        install()
        const mk = (h: object): File => { const e = new TextEncoder().encode(JSON.stringify(h)); const l = new Uint8Array(4); new DataView(l.buffer).setUint32(0, e.length, true); return new File([new TextEncoder().encode(MAGIC_TEXT), l, e], 'x') }
        const r = await importBundle(mk({ format: 2, renderVersion: RENDER_VERSION, device: 'D', createdAt: 1, project: '', units: [] }), () => undefined, new AbortController().signal)
        expect(r.refused).toBeTruthy()
        expect(await readBundleHeader(new File(['hello'], 'x'))).toBeNull()
        await expect(importBundle(new File(['hello'], 'x'), () => undefined, new AbortController().signal)).rejects.toThrow(/prepared parts file/)
    })
    it('should leave no half unit when cancelled mid-import', async () => {
        const root = install()
        await prepared()
        const file = new File([await buildBundle('p', opts)], 'x')
        wipe(root)
        const ac = new AbortController()
        const r = await importBundle(file, (d) => { if (d > 0) ac.abort() }, ac.signal)
        expect(r.cancelled).toBe(true)
        const names = [...((root.kids.get('unit-cache') as DirNode)?.kids.keys() ?? [])].filter((k) => k !== 'manifest.json')
        // Every file left belongs to a whole unit: a .json for each .bin and the other way round, and it loads.
        const stems = new Set(names.map((n) => n.replace(/\.(bin|json)$/, '')))
        for (const s of stems) { expect(names).toContain(`${s}.bin`); expect(names).toContain(`${s}.json`); expect(await opfsUnitStore().findPortable(s)).not.toBeNull() }
        expect(r.imported).toBe(stems.size)
    })
    it('should cancel inside a unit (records stop part-way) and leave nothing of it', async () => {
        const root = install()
        await prepared()
        const file = new File([await buildBundle('p', opts)], 'x')
        wipe(root)
        const ac = new AbortController()
        ac.abort()
        const r = await importBundle(file, () => undefined, ac.signal)
        expect(r.cancelled).toBe(true)
        expect([...((root.kids.get('unit-cache') as DirNode)?.kids.keys() ?? [])].filter((k) => k !== 'manifest.json')).toEqual([])
    })
    it('should ignore the units a truncated file cannot supply', async () => {
        const root = install()
        await prepared()
        const blob = await buildBundle('p', opts)
        const cut = new File([blob.slice(0, blob.size - 5)], 'x')
        wipe(root)
        const r = await importBundle(cut, () => undefined, new AbortController().signal)
        expect(r.imported).toBe(1)
    })
    const reframe = (head: BundleHeader, bytes: Uint8Array, dataStart: number): File => {
        const enc = new TextEncoder().encode(JSON.stringify(head)); const l = new Uint8Array(4); new DataView(l.buffer).setUint32(0, enc.length, true)
        return new File([MAGIC, l, enc, bytes.slice(dataStart)], 'x')
    }
    const made = async (): Promise<{ bytes: Uint8Array; head: NonNullable<Awaited<ReturnType<typeof readBundleHeader>>> }> => {
        const bytes = new Uint8Array(await (await buildBundle('p', opts)).arrayBuffer())
        return { bytes, head: (await readBundleHeader(new File([bytes], 'x')))! }
    }
    it('should count the skipped units: damaged (overlap, record count), and keep a good one', async () => {
        const root = install()
        await prepared()
        const { bytes, head } = await made()
        const [a, b] = head.header.units
        expect(a.records).toBeGreaterThan(0)
        wipe(root)
        const overlap = reframe({ ...head.header, units: [a, { ...b, offset: a.offset }] }, bytes, head.dataStart)
        const r1 = await importBundle(overlap, () => undefined, new AbortController().signal)
        expect(r1).toMatchObject({ imported: 1, skipped: { damaged: 1, space: 0, failed: 0 } })
        wipe(root)
        const wrong = reframe({ ...head.header, units: [{ ...a, records: a.records + 1 }, b] }, bytes, head.dataStart)
        const r2 = await importBundle(wrong, () => undefined, new AbortController().signal)
        expect(r2).toMatchObject({ imported: 1, skipped: { damaged: 1 } })
        expect(await opfsUnitStore().findPortable(a.portable)).toBeNull()
        expect([...((root.kids.get('unit-cache') as DirNode).kids.keys())].filter((k) => k.startsWith(a.portable))).toEqual([])
    })
    it('should treat zero or fractional sizes, a duplicate key and an oversized device name as damaged / trimmed', async () => {
        const root = install()
        await prepared()
        const { bytes, head } = await made()
        const [a, b] = head.header.units
        wipe(root)
        const f = reframe({ ...head.header, device: `  ${'x'.repeat(100)}  `, units: [{ ...a, bytes: 0 }, { ...b, bytes: 1.5 }, { ...a, applied: ['ok', 3] as unknown as string[] }, { ...a }] }, bytes, head.dataStart)
        const r = await importBundle(f, () => undefined, new AbortController().signal)
        expect(r.device).toBe('x'.repeat(64))
        expect(r.imported).toBe(1)
        expect(r.skipped.damaged).toBe(3)
        expect((await opfsUnitStore().findPortable(a.portable))!.meta.applied).toEqual(['ok'])
    })
    it('should count units that do not fit the free space', async () => {
        const root = install()
        await prepared()
        const f = new File([await buildBundle('p', opts)], 'x')
        wipe(root)
        vi.stubGlobal('navigator', { storage: { getDirectory: async () => dirHandle(root), estimate: async () => ({ quota: 10, usage: 0 }) } })
        const r = await importBundle(f, () => undefined, new AbortController().signal)
        expect(r).toMatchObject({ imported: 0, skipped: { space: 2, damaged: 0 } })
    })
    it('should drop a project that is too big or inflates past the cap, and still import the parts', async () => {
        const root = install()
        await prepared()
        const { bytes, head } = await made()
        wipe(root)
        const huge = reframe({ ...head.header, project: 'r1.' + 'A'.repeat(9 * 1024 * 1024) }, bytes, head.dataStart)
        const r = await importBundle(huge, () => undefined, new AbortController().signal)
        expect(r.project).toBeNull()
        expect(r.imported).toBe(2)
        wipe(root)
        const bomb = new Uint8Array(new ArrayBuffer(40 * 1024 * 1024))
        const gz = new Uint8Array(await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
        let bin = ''; for (const c of gz) bin += String.fromCharCode(c)
        const z = 'z1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        const r2 = await importBundle(reframe({ ...head.header, project: z }, bytes, head.dataStart), () => undefined, new AbortController().signal)
        expect(r2.project).toBeNull()
        expect(r2.imported).toBe(2)
    })
    it('should refuse to save when a prepared part disappears while the file is made', async () => {
        const root = install()
        await prepared()
        const cache = root.kids.get('unit-cache') as DirNode
        const real = cache.kids.get(`${L2}.bin`) as FileNode
        let reads = 0
        // The second look at L2 finds it gone (trimmed meanwhile).
        const origGet = cache.kids.get.bind(cache.kids)
        cache.kids.get = (k: string) => (k === `${L2}.json` && ++reads > 1 ? undefined : origGet(k))
        void real
        await expect(buildBundle('p', opts)).rejects.toThrow(/changed while/)
    })
    it('should skip a unit whose key is not a portable key (the file comes from outside)', async () => {
        const root = install()
        await prepared()
        const bytes = new Uint8Array(await (await buildBundle('p', opts)).arrayBuffer())
        const head = await readBundleHeader(new File([bytes], 'x'))
        const evil = { ...head!.header, units: head!.header.units.map((u) => ({ ...u, portable: '../manifest' })) }
        const enc = new TextEncoder().encode(JSON.stringify(evil)); const l = new Uint8Array(4); new DataView(l.buffer).setUint32(0, enc.length, true)
        wipe(root)
        const r = await importBundle(new File([new TextEncoder().encode(MAGIC_TEXT), l, enc, bytes.slice(head!.dataStart)], 'x'), () => undefined, new AbortController().signal)
        expect(r.imported).toBe(0)
        void importUnit
    })
    it('should peek at the project, the device and the part count without importing anything', async () => {
        const root = install()
        await prepared()
        const file = new File([await buildBundle('p', opts)], 'x')
        wipe(root)
        const peek = await readBundleProject(file)
        expect(peek).toMatchObject({ device: 'Pixel', units: 2 })
        expect(peek!.project?.teams).toHaveLength(2)
        expect(await opfsUnitStore().findPortable(P1)).toBeNull()
        expect(await readBundleProject(new File(['not a parts file'], 'x'))).toBeNull()
    })
    it('should summarise and save only the kinds asked for (the open project\'s), sizes read without counting records', async () => {
        install()
        await prepared()
        const all = await preparedSummary()
        expect(all.units).toBe(2)
        expect(all.byKind.fullMatch?.units).toBe(1)
        expect(all.byKind.highlights?.units).toBe(1)
        expect(all.byKind.fullMatch!.bytes + all.byKind.highlights!.bytes).toBe(all.bytes)
        const full = await preparedSummary({ kinds: ['fullMatch'] })
        expect(full.units).toBe(1)
        expect(full.bytes).toBeGreaterThan(0)
        const head = await readBundleHeader(new File([await buildBundle('p', { ...opts, kinds: ['fullMatch'] })], 'x'))
        expect(head!.header.units.map((u) => u.portable)).toEqual([P1])
        expect(head!.header.units[0].records).toBe(3)
    })
})
