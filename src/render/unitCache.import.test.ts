import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearUnitCache, importUnit, importedParts, opfsUnitStore, IMPORTED_KEEP_MS } from './unitCache'
import type { LogRecord } from './packetLog'

// A small in-memory OPFS: files hold real bytes, so units round-trip through the store's own reader and writer.
type FileNode = { kind: 'file'; chunks: Uint8Array[] }
type DirNode = { kind: 'directory'; kids: Map<string, FileNode | DirNode> }
const dir = (): DirNode => ({ kind: 'directory', kids: new Map() })
const toBytes = (d: unknown): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d as ArrayBuffer))
const fileHandle = (n: FileNode): unknown => ({
    kind: 'file',
    getFile: async () => new File(n.chunks as BlobPart[], 'x'),
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
        if (!c) { if (!o?.create) throw new DOMException('nf', 'NotFoundError'); c = { kind: 'file', chunks: [] }; n.kids.set(k, c) }
        return fileHandle(c as FileNode)
    },
    removeEntry: async (k: string) => { if (!n.kids.delete(k)) throw new DOMException('nf', 'NotFoundError') },
})
const install = (quota = 1e12): DirNode => {
    const root = dir()
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => dirHandle(root), estimate: async () => ({ quota, usage: 0 }) } })
    return root
}
afterEach(() => vi.unstubAllGlobals())

const P1 = 'a'.repeat(32)
const P2 = 'b'.repeat(32)
const rec = (i: number): LogRecord => ({ track: 0, key: i === 0, timestamp: i / 30, duration: 1 / 30, data: new Uint8Array([i, i + 1, i + 2]) })
async function* records(n: number): AsyncGenerator<LogRecord> { for (let i = 0; i < n; i++) yield rec(i) }
const meta = { applied: ['Goal'], video: { codec: 'avc1.640033', description: 'AAEC' }, device: 'iPhone', batch: 'bundle-1', bytes: 100 }
const P3 = 'd'.repeat(32)
const manifestOf = async (root: DirNode): Promise<Record<string, unknown>> => JSON.parse(await new File(((root.kids.get('unit-cache') as DirNode).kids.get('manifest.json') as FileNode).chunks as BlobPart[], 'm').text())
const unitNames = (root: DirNode): string[] => [...((root.kids.get('unit-cache') as DirNode)?.kids.keys() ?? [])].filter((k) => k !== 'manifest.json').sort()
const collect = async (it: AsyncIterable<LogRecord>): Promise<LogRecord[]> => { const out: LogRecord[] = []; for await (const r of it) out.push(r); return out }

describe('imported units (prepared on another device)', () => {
    it('should be found by their portable key, with the device they came from, when no local key has them', async () => {
        install()
        expect(await importUnit(P1, records(3), meta)).toBe(true)
        const store = opfsUnitStore()
        expect((await store.keys()).has(P1)).toBe(true)
        const hit = await store.findPortable(P1)
        expect(hit).not.toBeNull()
        expect(hit!.meta.device).toBe('iPhone')
        expect(hit!.meta.imported).toBe(true)
        expect(hit!.meta.portable).toBe(P1)
        expect(hit!.meta.video).toEqual(meta.video)
        const got = await collect(hit!.records)
        expect(got.map((r) => Array.from(r.data))).toEqual([[0, 1, 2], [1, 2, 3], [2, 3, 4]])
        expect(await store.findPortable(P2)).toBeNull()
    })
    it('should not take a local unit for an imported one', async () => {
        install()
        const store = opfsUnitStore()
        await store.save(P1, records(1), { applied: [], video: meta.video, portable: P2 })
        expect(await store.findPortable(P1)).toBeNull()
    })
    it('should refuse a key that is not a portable key (the file comes from outside)', async () => {
        const root = install()
        expect(await importUnit('../manifest', records(1), meta)).toBe(false)
        expect(await importUnit('A'.repeat(32), records(1), meta)).toBe(false)
        expect(unitNames(root)).toEqual([])
    })
    it('should leave no half unit when the import stops part-way', async () => {
        const root = install()
        async function* broken(): AsyncGenerator<LogRecord> { yield rec(0); throw new DOMException('cancelled', 'AbortError') }
        expect(await importUnit(P1, broken(), meta)).toBe(false)
        expect(unitNames(root)).toEqual([])
        expect(await opfsUnitStore().findPortable(P1)).toBeNull()
    })
    it('should refuse an import that does not fit the free space', async () => {
        install(1000)
        expect(await importUnit(P1, records(1), { ...meta, bytes: 5000 })).toBe(false)
    })
    it('should survive trims and an unrelated export of the same kind (a 1080p export, then the 4K render still reuses them)', async () => {
        const root = install()
        await importUnit(P1, records(2), meta)
        await importUnit(P2, records(2), meta)
        const store = opfsUnitStore()
        await store.trim()
        await store.finish('fullMatch', { units: ['e'.repeat(32)], sections: [] }) // the 1080p export: none of them
        await store.finish('highlights', { units: [], sections: [] })
        expect(unitNames(root)).toEqual([`${P1}.bin`, `${P1}.json`, `${P2}.bin`, `${P2}.json`])
        expect(await store.findPortable(P1)).not.toBeNull()
        expect(await store.findPortable(P2)).not.toBeNull()
    })
    it('should release the previous import\'s parts when a newer parts file is loaded (unless an export uses them)', async () => {
        const root = install()
        await importUnit(P1, records(2), meta)
        await importUnit(P2, records(2), meta)
        const store = opfsUnitStore()
        await store.finish('fullMatch', { units: [P2], sections: [] }) // the last export used P2: it stays as that export's part
        await importUnit(P3, records(2), { ...meta, batch: 'bundle-2' })
        await store.trim()
        expect(unitNames(root)).toEqual([`${P2}.bin`, `${P2}.json`, `${P3}.bin`, `${P3}.json`])
        expect(await store.findPortable(P3)).not.toBeNull()
    })
    it('should go when the saved parts are cleared', async () => {
        const root = install()
        await importUnit(P1, records(2), meta)
        await clearUnitCache()
        expect(root.kids.has('unit-cache')).toBe(false)
    })
    it('should expire 14 days after the import', async () => {
        const root = install()
        const t0 = Date.now()
        await importUnit(P1, records(2), meta)
        const now = vi.spyOn(Date, 'now')
        now.mockReturnValue(t0 + IMPORTED_KEEP_MS - 60_000)
        await opfsUnitStore().trim()
        expect(unitNames(root)).toEqual([`${P1}.bin`, `${P1}.json`])
        now.mockReturnValue(t0 + IMPORTED_KEEP_MS + 60_000)
        await opfsUnitStore().trim()
        expect(unitNames(root)).toEqual([])
        now.mockRestore()
    })
    it('should not evict imported parts as the oldest before their first use', async () => {
        const root = install(100) // tiny cap: something must go
        await importUnit(P1, records(20), { ...meta, bytes: 1 })
        const store = opfsUnitStore()
        await store.save('c'.repeat(32), records(20), { applied: [], video: meta.video })
        await store.finish('fullMatch', { units: ['c'.repeat(32)], sections: [] })
        await store.trim()
        expect(unitNames(root)).toContain(`${P1}.json`)
    })
    it('should not lose a manifest entry when writers interleave', async () => {
        const root = install()
        const store = opfsUnitStore()
        await Promise.all([
            importUnit(P1, records(2), meta),
            store.prepare('fullMatch', { keys: ['x'.repeat(32)], budget: 5 }),
            importUnit(P2, records(2), meta),
            store.prepare('highlights', { keys: ['y'.repeat(32)], budget: 5 }),
            importUnit(P3, records(2), meta),
        ])
        const m = await manifestOf(root) as { imported: { units: string[] }; prepared: Record<string, unknown> }
        expect([...m.imported.units].sort()).toEqual([P1, P2, P3])
        expect(Object.keys(m.prepared).sort()).toEqual(['fullMatch', 'highlights'])
    })
    it('should never evict imported units the current plan uses, even over the cap', async () => {
        const root = install(100) // cap = max(25 B, budgets): tiny
        await importUnit(P1, records(20), { ...meta, bytes: 1 })
        const store = opfsUnitStore()
        await store.save('c'.repeat(32), records(20), { applied: [], video: meta.video })
        await store.finish('fullMatch', { units: [P1, 'c'.repeat(32)], sections: [] })
        expect(unitNames(root)).toContain(`${P1}.json`)
        expect(unitNames(root)).not.toContain(`${'c'.repeat(32)}.json`)
    })
    it('should say which device the loaded parts came from (for the Save to file note), and nothing without any', async () => {
        install()
        expect(await importedParts()).toBeNull()
        expect(await importUnit(P1, records(3), meta)).toBe(true)
        expect(await importUnit(P2, records(2), meta)).toBe(true)
        expect(await importedParts()).toEqual({ device: 'iPhone', units: 2 })
    })
})
