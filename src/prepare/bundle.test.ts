import { afterEach, describe, expect, it, vi } from 'vitest'
import { opfsUnitStore, importUnit, RENDER_VERSION } from '../render/unitCache'
import type { LogRecord } from '../render/packetLog'
const MAGIC_TEXT = 'SHOOO' + 'TPARTS\n'
import { buildBundle, importBundle, readBundleHeader, MAGIC } from './bundle'
import type { TransferPayload } from '../utils/projectTransfer'

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
})
