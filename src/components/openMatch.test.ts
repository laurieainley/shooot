// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { openMatchStore, readOpenMatchId, setOpenMatch } from './openMatch'

describe('openMatch', () => {
    beforeEach(() => { localStorage.clear(); openMatchStore.setState({ id: null, files: [], saveError: false }) })

    it('should round-trip the open id through localStorage', () => {
        setOpenMatch('m-1-abcd', [{ name: 'a.mp4', size: 1, key: 'a.mp4' }])
        expect(readOpenMatchId()).toBe('m-1-abcd')
        expect(openMatchStore.getState().files).toHaveLength(1)
        setOpenMatch(null)
        expect(readOpenMatchId()).toBeNull()
        expect(openMatchStore.getState()).toMatchObject({ id: null, files: [] })
    })

    it('should treat unreadable storage as no open match', () => {
        const orig = Storage.prototype.getItem
        Storage.prototype.getItem = () => { throw new Error('denied') }
        try { expect(readOpenMatchId()).toBeNull() } finally { Storage.prototype.getItem = orig }
    })
})
