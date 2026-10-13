import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, v) }),
    del: vi.fn(async (k: string) => { store.delete(k) }),
}))

import { discardJob, loadJob, saveJob, type JobState } from './renderJob'

type Dir = { kind: 'directory'; files: Map<string, { kind: 'file'; name: string; move: (to: Dir, name: string) => Promise<void> }> }
const dirs = new Map<string, Dir>()
const makeDir = (): Dir => ({ kind: 'directory', files: new Map() })
const addFile = (d: Dir, name: string): void => {
    const f = { kind: 'file' as const, name, move: async (to: Dir, n: string) => { d.files.delete(name); to.files.set(n, { ...f, name: n }) } }
    d.files.set(name, f)
}
const handleOf = (d: Dir) => Object.assign(d, { entries: async function* () { for (const e of d.files) yield e } })
const root = {
    getDirectoryHandle: async (name: string, o?: { create?: boolean }) => {
        let d = dirs.get(name)
        if (!d) { if (!o?.create) throw new DOMException('nf', 'NotFoundError'); d = makeDir(); dirs.set(name, d) }
        return handleOf(d)
    },
    removeEntry: async (name: string) => { if (!dirs.delete(name)) throw new DOMException('nf', 'NotFoundError') },
}

const job = (kind: 'highlights' | 'fullMatch', signature: string): JobState => ({
    kind, signature, outputName: 'x.mp4', graphics: false, unitsDone: 3, unitCount: 9, cursor: 1, done: 1, total: 2, copied: true, report: null, video: null, audio: null, updatedAt: 0,
})

beforeEach(() => {
    store.clear(); dirs.clear()
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } })
})

describe('saved jobs per kind', () => {
    it('should keep a highlights job and a full match job side by side', async () => {
        await saveJob(job('fullMatch', 'full'))
        await saveJob(job('highlights', 'reel'))
        expect((await loadJob('fullMatch'))?.signature).toBe('full')
        expect((await loadJob('highlights'))?.signature).toBe('reel')
    })
    it('should discard only its own kind, logs included', async () => {
        await saveJob(job('fullMatch', 'full'))
        await saveJob(job('highlights', 'reel'))
        dirs.set('render-job-fullMatch', makeDir()); dirs.set('render-job-highlights', makeDir())
        await discardJob('highlights')
        expect(await loadJob('highlights')).toBeNull()
        expect((await loadJob('fullMatch'))?.signature).toBe('full')
        expect([...dirs.keys()]).toEqual(['render-job-fullMatch'])
    })
    it('should discard everything when no kind is given', async () => {
        await saveJob(job('fullMatch', 'full'))
        store.set('render-job', job('highlights', 'old'))
        dirs.set('render-job', makeDir())
        await discardJob()
        expect(store.size).toBe(0)
        expect(dirs.size).toBe(0)
    })
})

describe('migration of the single saved job', () => {
    it('should move an old job and its logs to its own kind and leave the other kind empty', async () => {
        store.set('render-job', job('fullMatch', 'old-full'))
        const legacy = makeDir(); addFile(legacy, 'u-0000.bin'); addFile(legacy, 'u-0001.bin'); dirs.set('render-job', legacy)
        expect(await loadJob('highlights')).toBeNull()
        expect(store.has('render-job')).toBe(true) // not a highlights job: untouched
        expect((await loadJob('fullMatch'))?.signature).toBe('old-full')
        expect(store.has('render-job')).toBe(false)
        expect(dirs.has('render-job')).toBe(false)
        expect([...dirs.get('render-job-fullMatch')!.files.keys()]).toEqual(['u-0000.bin', 'u-0001.bin'])
    })
    it('should drop an old job whose logs cannot be moved rather than resume from missing logs', async () => {
        store.set('render-job', job('highlights', 'old'))
        const legacy = makeDir(); legacy.files.set('u-0000.bin', { kind: 'file', name: 'u-0000.bin', move: undefined as never }); dirs.set('render-job', legacy)
        expect(await loadJob('highlights')).toBeNull()
        expect(store.has('render-job')).toBe(false)
    })
})
