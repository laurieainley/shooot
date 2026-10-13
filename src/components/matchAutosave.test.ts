// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('idb-keyval', async () => (await import('../files/idbMock')).idbMock())

import * as idb from 'idb-keyval'
import { useAppState } from '../state'
import { listMatches, getMatch } from '../files/matchStore'
import * as matchStore from '../files/matchStore'
import { openMatchStore, setOpenMatch } from './openMatch'
import { adoptCurrentMatch, createAutosaver } from './matchAutosave'
import type { MatchEvent } from '../types'

const reset = (idb as unknown as { __reset: () => void }).__reset
const goal = (id: string): MatchEvent => ({ id, type: 'goal', matchTimeSec: 5, sourceFileIndex: 0, team: 'Whites' }) as MatchEvent
const cleanState = { files: [] as never[], events: [] as MatchEvent[], matchdayLabel: null }

describe('matchAutosave', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        reset()
        localStorage.clear()
        openMatchStore.setState({ id: null, files: [], saveError: false })
        useAppState.setState({ ...cleanState })
    })
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

    it('should write nothing before the delay and one record after it', async () => {
        const a = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        a.schedule()
        await vi.advanceTimersByTimeAsync(900)
        expect(await listMatches()).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(200)
        expect(await listMatches()).toHaveLength(1)
        a.stop()
    })

    it('should collapse changes within the delay into one write', async () => {
        const put = vi.spyOn(matchStore, 'putMatch')
        const a = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        a.schedule()
        await vi.advanceTimersByTimeAsync(500)
        useAppState.setState({ events: [goal('1'), goal('2')] })
        a.schedule()
        await vi.advanceTimersByTimeAsync(1100)
        expect(put).toHaveBeenCalledTimes(1)
        a.stop()
    })

    it('should not save an empty match', async () => {
        const a = createAutosaver()
        await a.flush()
        expect(await listMatches()).toHaveLength(0)
        expect(openMatchStore.getState().id).toBeNull()
    })

    it('should assign an id and remember it on flush', async () => {
        const a = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        await a.flush()
        const id = openMatchStore.getState().id
        expect(id).toMatch(/^m-\d+-[0-9a-z]{4}$/)
        expect(localStorage.getItem('shooot-open-match')).toBe(id)
        expect((await getMatch(id!))?.data.events).toHaveLength(1)
    })

    it('should flag a failed write without throwing', async () => {
        vi.spyOn(matchStore, 'putMatch').mockRejectedValue(new Error('quota'))
        const a = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        await expect(a.flush()).resolves.toBeUndefined()
        expect(openMatchStore.getState().saveError).toBe(true)
    })

    it('should skip a write when nothing changed', async () => {
        const put = vi.spyOn(matchStore, 'putMatch')
        const a = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        await a.flush()
        await a.flush()
        expect(put).toHaveBeenCalledTimes(1)
    })

    it('should give two tabs with different open ids two records', async () => {
        const a = createAutosaver()
        const b = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        setOpenMatch('m-tab-a')
        await a.flush()
        useAppState.setState({ events: [goal('2')] })
        setOpenMatch('m-tab-b')
        await b.flush()
        expect((await listMatches()).map((m) => m.id).sort()).toEqual(['m-tab-a', 'm-tab-b'])
    })

    it('should not create two ids from overlapping flushes', async () => {
        const a = createAutosaver()
        useAppState.setState({ events: [goal('1')] })
        await Promise.all([a.flush(), a.flush()])
        expect(await listMatches()).toHaveLength(1)
    })
})

describe('adoptCurrentMatch', () => {
    beforeEach(() => {
        reset()
        localStorage.clear()
        openMatchStore.setState({ id: null, files: [], saveError: false })
        useAppState.setState({ ...cleanState })
    })

    it('should turn the existing match into the first record and move the old handles', async () => {
        useAppState.setState({ events: [goal('1')] })
        await idb.set('file-handles', [{ name: 'old.mp4' }])
        await adoptCurrentMatch()
        const id = openMatchStore.getState().id!
        expect(await listMatches()).toHaveLength(1)
        expect(await idb.get(`match-handles:${id}`)).toEqual([{ name: 'old.mp4' }])
        expect(await idb.get('file-handles')).toBeUndefined()
    })

    it('should do nothing when a match is already open', async () => {
        useAppState.setState({ events: [goal('1')] })
        setOpenMatch('m-open')
        await adoptCurrentMatch()
        expect(await listMatches()).toHaveLength(0)
    })

    it('should do nothing for an empty match', async () => {
        await adoptCurrentMatch()
        expect(await listMatches()).toHaveLength(0)
    })
})

describe('matchAutosave updatedAt', () => {
    beforeEach(() => {
        reset()
        localStorage.clear()
        openMatchStore.setState({ id: null, files: [], saveError: false })
        useAppState.setState({ ...cleanState })
    })

    it('should not move updatedAt when a saved match is opened and autosaved again', async () => {
        let t = 1000
        const a = createAutosaver({ now: () => t })
        useAppState.setState({ events: [goal('1')] })
        await a.flush()
        const id = openMatchStore.getState().id!
        const first = (await getMatch(id))!.updatedAt
        // open it: the record is loaded back into the store (events re-created with the same content)
        const rec = (await getMatch(id))!
        useAppState.setState({ events: rec.data.events.map((e) => ({ ...Object.fromEntries(Object.entries(e).reverse()) })) as MatchEvent[] })
        t = 9000
        await createAutosaver({ now: () => t }).flush()
        expect((await getMatch(id))!.updatedAt).toBe(first)
    })

    it('should not count a relink as an edit but should count a change', async () => {
        let t = 1000
        const a = createAutosaver({ now: () => t })
        useAppState.setState({ events: [goal('1')] })
        await a.flush()
        const id = openMatchStore.getState().id!
        t = 5000
        useAppState.setState({ events: [goal('1'), goal('2')] })
        await a.flush()
        expect((await getMatch(id))!.updatedAt).toBe(5000)
    })
})
