// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('idb-keyval', async () => (await import('./idbMock')).idbMock())

import * as idb from 'idb-keyval'
import { deleteMatch, getMatch, listMatches, putMatch } from './matchStore'
import { adoptLegacyHandles, loadHandles, rememberHandles, type StoredHandle } from './handleStore'
import { openMatchStore, setOpenMatch } from '../components/openMatch'
import { buildRecord, type MatchData, type MatchRecord } from '../utils/matchRecord'

const reset = (idb as unknown as { __reset: () => void }).__reset
const store = idb.createStore('shooot-matches', 'matches')

function rec(id: string, now: number): MatchRecord {
    const data = { events: [], teams: [], suggestions: [], suggestionRun: null, clipOptions: { replay: true, score: true } } as unknown as MatchData
    return buildRecord({ ...data, files: [] }, id, now)
}
const handle = (name: string): StoredHandle => ({ kind: 'file', name }) as unknown as StoredHandle

describe('matchStore', () => {
    beforeEach(() => { reset(); localStorage.clear(); openMatchStore.setState({ id: null, files: [], saveError: false }) })

    it('should list matches newest first', async () => {
        await putMatch(rec('m-a', 100))
        await putMatch(rec('m-b', 200))
        expect((await listMatches()).map((m) => m.id)).toEqual(['m-b', 'm-a'])
    })

    it('should list an unreadable value as broken and not return it from getMatch', async () => {
        await idb.set('m-bad', 'oops', store)
        await putMatch(rec('m-a', 100))
        const list = await listMatches()
        expect(list.find((m) => m.id === 'm-bad')).toEqual({ id: 'm-bad', broken: true })
        expect(await getMatch('m-bad')).toBeNull()
        expect(await getMatch('missing')).toBeNull()
        expect((await getMatch('m-a'))?.id).toBe('m-a')
    })

    it('should delete the record and its handles', async () => {
        await putMatch(rec('m-a', 100))
        await idb.set('match-handles:m-a', [handle('a.mp4')])
        await deleteMatch('m-a')
        expect(await getMatch('m-a')).toBeNull()
        expect(await idb.get('match-handles:m-a')).toBeUndefined()
    })
})

describe('per-match handles', () => {
    beforeEach(() => { reset(); openMatchStore.setState({ id: null, files: [], saveError: false }) })

    it('should keep handles apart per open match', async () => {
        setOpenMatch('m-a')
        await rememberHandles([handle('a.mp4')])
        setOpenMatch('m-b')
        expect(await loadHandles()).toEqual([])
        setOpenMatch('m-a')
        expect((await loadHandles()).map((h) => h.name)).toEqual(['a.mp4'])
    })

    it('should adopt the legacy list into a match', async () => {
        await idb.set('file-handles', [handle('old.mp4')])
        await adoptLegacyHandles('m-a')
        expect(await idb.get('file-handles')).toBeUndefined()
        setOpenMatch('m-a')
        expect((await loadHandles()).map((h) => h.name)).toEqual(['old.mp4'])
    })
})
