import { afterEach, describe, it, expect, vi } from 'vitest'
import { clearOldOutputs, isStorageFull, storageFullMessage, storageRoom } from './storage'

const fakeRoot = (names: [string, 'file' | 'directory'][]) => {
    const left = new Map(names)
    return {
        left,
        root: {
            entries: async function* () { for (const [n, kind] of [...left]) yield [n, { kind }] },
            removeEntry: async (n: string) => { left.delete(n) },
        },
    }
}

afterEach(() => vi.unstubAllGlobals())

describe('render storage', () => {
    it('should recognise the quota error by name or message', () => {
        expect(isStorageFull(new DOMException('x', 'QuotaExceededError'))).toBe(true)
        expect(isStorageFull(new Error('The operation failed because it would cause the application to exceed its storage quota.'))).toBe(true)
        expect(isStorageFull(new Error('decoder failed'))).toBe(false)
    })

    it('should delete earlier renders but keep the given file and saved-progress folders', async () => {
        const { root, left } = fakeRoot([['Matchday 1 - A 1-0 B.mp4', 'file'], ['full-match.mp4', 'file'], ['keep.mp4', 'file'], ['render-job', 'directory']])
        vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } })
        expect(await clearOldOutputs('keep.mp4')).toBe(2)
        expect([...left.keys()]).toEqual(['keep.mp4', 'render-job'])
    })

    it('should explain with the browser\'s numbers', async () => {
        vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 4e9, usage: 3.5e9 }) } })
        const msg = await storageFullMessage()
        expect(msg).toMatch(/not your disk/)
        expect(msg).toMatch(/about 4\.0 GB and 0\.5 GB of that is free/)
    })
})

describe('storage room and the unit cache', () => {
    it('should count the saved parts of earlier exports as room (a render evicts them before it would run short)', async () => {
        const file = (size: number) => ({ kind: 'file', getFile: async () => ({ size }) })
        const cacheDir = { kind: 'directory', entries: async function* () { yield ['a.bin', file(300)]; yield ['a.json', file(10)] }, getDirectoryHandle: async () => cacheDir }
        const root = { entries: async function* () { yield ['old.mp4', file(100)] }, getDirectoryHandle: async (n: string) => { if (n === 'unit-cache') return cacheDir; throw new Error('none') } }
        vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1000, usage: 500 }), getDirectory: async () => root } })
        const room = await storageRoom()
        expect(room).toEqual({ quota: 1000, free: 500 + 100 + 310, cache: 310 })
    })
})
