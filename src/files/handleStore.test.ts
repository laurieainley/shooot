import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
    get: vi.fn(async (k: string) => db.get(k)),
    set: vi.fn(async (k: string, v: unknown) => { db.set(k, v) }),
    del: vi.fn(async (k: string) => { db.delete(k) }),
}))

import { clearHandles, loadHandles, reopenHandles, rememberHandles, type StoredHandle } from './handleStore'

const handle = (name: string, permission: PermissionState = 'granted', after: PermissionState = permission): StoredHandle => ({
    kind: 'file', name,
    getFile: vi.fn(async () => new File(['x'], name)),
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => after),
}) as unknown as StoredHandle

describe('handleStore', () => {
    beforeEach(() => db.clear())

    it('should remember handles by file name, newest winning', async () => {
        const a1 = handle('GX010001.MP4')
        await rememberHandles([a1, handle('GX020001.MP4')])
        const a2 = handle('GX010001.MP4')
        await rememberHandles([a2])
        const stored = await loadHandles()
        expect(stored.map((h) => h.name)).toEqual(['GX010001.MP4', 'GX020001.MP4'])
        expect(stored[0]).toBe(a2)
    })

    it('should reopen files, asking for permission when needed, and report the ones it could not', async () => {
        const ok = handle('a.mp4')
        const ask = handle('b.mp4', 'prompt', 'granted')
        const no = handle('c.mp4', 'prompt', 'denied')
        const { files, failed } = await reopenHandles([ok, ask, no])
        expect(files.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4'])
        expect(failed).toEqual(['c.mp4'])
        expect(ask.requestPermission).toHaveBeenCalledWith({ mode: 'read' })
    })

    it('should forget everything on clear', async () => {
        await rememberHandles([handle('a.mp4')])
        await clearHandles()
        expect(await loadHandles()).toEqual([])
    })
})
