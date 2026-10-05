import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, v) }),
    del: vi.fn(async (k: string) => { store.delete(k) }),
}))

import { clearCustomLogo, loadCustomLogo, saveCustomLogo } from './logoStore'

describe('logoStore', () => {
    beforeEach(() => store.clear())

    it('should return null when no custom logo is stored', async () => {
        expect(await loadCustomLogo()).toBeNull()
    })

    it('should save, load and clear a picked image', async () => {
        const blob = new Blob(['png'], { type: 'image/png' })
        await saveCustomLogo(blob)
        expect(await loadCustomLogo()).toBe(blob)
        await clearCustomLogo()
        expect(await loadCustomLogo()).toBeNull()
    })

    it('should reject files that are not images', async () => {
        await expect(saveCustomLogo(new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow(/image/)
    })

    it('should treat a storage failure as no logo', async () => {
        const idb = await import('idb-keyval')
        vi.mocked(idb.get).mockRejectedValueOnce(new Error('blocked'))
        expect(await loadCustomLogo()).toBeNull()
    })
})
