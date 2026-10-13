import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => undefined, del: async () => undefined }))

import { clearAllOpfs, listOpfs } from './storageInspect'
import { opfsUnitStore } from '../render/unitCache'

type Node = { kind: 'file'; size: number } | { kind: 'directory'; kids: Map<string, Node> }
const file = (size: number): Node => ({ kind: 'file', size })
const dir = (o: Record<string, Node> = {}): Node => ({ kind: 'directory', kids: new Map(Object.entries(o)) })

const handle = (n: Node): unknown => {
    if (n.kind === 'file') return { kind: 'file', getFile: async () => ({ size: n.size }), createWritable: async () => ({ write: async () => undefined, close: async () => undefined, abort: async () => undefined }) }
    return {
        kind: 'directory',
        entries: async function* () { for (const [k, v] of [...n.kids]) yield [k, handle(v)] },
        getDirectoryHandle: async (k: string, o?: { create?: boolean }) => {
            let c = n.kids.get(k)
            if (!c) { if (!o?.create) throw new DOMException('nf', 'NotFoundError'); c = dir(); n.kids.set(k, c) }
            return handle(c)
        },
        getFileHandle: async (k: string, o?: { create?: boolean }) => {
            let c = n.kids.get(k)
            if (!c) { if (!o?.create) throw new DOMException('nf', 'NotFoundError'); c = file(0); n.kids.set(k, c) }
            return handle(c)
        },
        removeEntry: async (k: string) => { if (!n.kids.delete(k)) throw new DOMException('nf', 'NotFoundError') },
    }
}
const install = (root: Node, quota = 1e12): void => { vi.stubGlobal('navigator', { storage: { getDirectory: async () => handle(root), estimate: async () => ({ quota, usage: 0 }) } }) }
afterEach(() => vi.unstubAllGlobals())

describe('OPFS listing and clearing', () => {
    it('should sum folders recursively and sort by size', async () => {
        install(dir({ 'a.mp4': file(10), 'exp-keep': dir({ 'x.mp4': file(100), 'y.mp4': file(50) }), 'unit-cache': dir({ sub: dir({ 'k.bin': file(5) }) }) }))
        expect(await listOpfs()).toEqual([{ name: 'exp-keep/', bytes: 150, files: 2 }, { name: 'a.mp4', bytes: 10, files: 1 }, { name: 'unit-cache/', bytes: 5, files: 1 }])
    })
    it('should remove every top-level entry', async () => {
        const root = dir({ 'a.mp4': file(10), 'render-job-fullMatch': dir({ 'u.bin': file(3) }) })
        install(root)
        await clearAllOpfs()
        expect(await listOpfs()).toEqual([])
    })
})

describe('unit cache cap and trim', () => {
    const cacheRoot = (): Node => dir({ 'unit-cache': dir({
        'old.bin': file(5e9), 'old.json': file(10), 'new.bin': file(2e9), 'new.json': file(10), 'half.bin': file(7e9),
        'manifest.json': file(10),
    }) })
    it('should count only parts saved since the last export against the cap, and trim them (plus orphans) after a cancel', async () => {
        const root = cacheRoot()
        const kids = (root as { kids: Map<string, Node> }).kids
        const cache = kids.get('unit-cache') as Node & { kids: Map<string, Node> }
        // The manifest is read from a real file, so serve its text.
        const m = handle(cache.kids.get('manifest.json')!) as { getFile: () => Promise<unknown> }
        m.getFile = async () => ({ size: 10, text: async () => JSON.stringify({ v: 1, kinds: { highlights: { at: 1, units: ['old'], sections: [] } } }) })
        const base = handle(root) as Record<string, unknown>
        const cacheHandle = handle(cache) as Record<string, unknown>
        const origFile = cacheHandle.getFileHandle as (k: string, o?: unknown) => Promise<unknown>
        cacheHandle.getFileHandle = async (k: string, o?: unknown) => (k === 'manifest.json' ? m : origFile(k, o))
        base.getDirectoryHandle = async () => cacheHandle
        vi.stubGlobal('navigator', { storage: { getDirectory: async () => base, estimate: async () => ({ quota: 1e12, usage: 0 }) } })
        const store = opfsUnitStore()
        expect(await store.hasRoomFor(3e9)).toBe(true) // old (5 GB) is the last export's: not counted; new (2 GB) + 3 GB fits in 6 GB
        expect(await store.hasRoomFor(4.5e9)).toBe(false)
        await store.trim()
        expect([...cache.kids.keys()].sort()).toEqual(['manifest.json', 'old.bin', 'old.json'])
    })
})
