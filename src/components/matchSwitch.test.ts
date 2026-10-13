// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('idb-keyval', async () => (await import('../files/idbMock')).idbMock())
vi.mock('../detectJobs', async (orig) => ({ ...(await orig<typeof import('../detectJobs')>()), cancelDetection: vi.fn(), getDetectJob: vi.fn(() => ({ phase: 'idle', ballPhase: 'idle' })) }))

import * as idb from 'idb-keyval'
import { useAppState } from '../state'
import { getDetectJob, cancelDetection } from '../detectJobs'
import { renderJobs } from '../renderJobs'
import { getMatch, listMatches, putMatch } from '../files/matchStore'
import { toastStore } from '../toasts'
import { openMatchStore, setOpenMatch } from './openMatch'
import { railTabStore } from './railTab'
import { createAutosaver, startAppAutosaver, stopAppAutosaver } from './matchAutosave'
import { openMatch, removeMatch, startNewMatch, stopBlocker, switchBlocker } from './matchSwitch'
import { buildRecord, type MatchData } from '../utils/matchRecord'
import type { MatchEvent, Team } from '../types'

const reset = (idb as unknown as { __reset: () => void }).__reset
const s = () => useAppState.getState()
const goal = (id: string, team = 'Whites'): MatchEvent => ({ id, type: 'goal', matchTimeSec: 5, sourceFileIndex: 0, team }) as MatchEvent
const teams = (a: string, b: string): Team[] => [{ name: a, color: '#fff', roster: [] }, { name: b, color: '#000', roster: [] }] as unknown as Team[]

function recordFor(id: string, over: Partial<MatchData> = {}, now = 100) {
    const data = { ...(Object.fromEntries(Object.entries(s()).filter(([k]) => ['lengthBeforeGoalSec', 'lengthAfterGoalSec', 'replayBeforeSec', 'replayAfterSec', 'replaySpeed', 'graphics', 'fullMatch', 'goalAreas', 'goalMarks', 'knownFinalScore', 'clipOptions'].includes(k)))), events: [goal('x')], teams: teams('Hawks', 'Lions'), matchdayLabel: 'Matchday 9', suggestions: [], suggestionRun: null, ...over } as unknown as MatchData
    return buildRecord({ ...data, files: [{ name: 'a.mp4', file: { size: 3 } }] }, id, now)
}

describe('matchSwitch', () => {
    let saver: ReturnType<typeof createAutosaver>
    beforeEach(() => {
        reset()
        localStorage.clear()
        openMatchStore.setState({ id: null, files: [], saveError: false })
        railTabStore.setState({ tab: 'matches' })
        toastStore.setState({ toast: null })
        vi.mocked(getDetectJob).mockReturnValue({ phase: 'idle', ballPhase: 'idle' } as never)
        vi.mocked(cancelDetection).mockClear()
        useAppState.setState({
            files: [], events: [], teams: teams('Whites', 'Colours'), matchdayLabel: null, panel: null,
            undoStack: [[goal('u')]], redoStack: [[goal('r')]], replaySpeed: 0.5, lengthBeforeGoalSec: 10,
        })
        saver = startAppAutosaver()
    })
    afterEach(() => { stopAppAutosaver(saver) })

    it('should replace events, teams and settings, clear undo, set the open id and show Events', async () => {
        await putMatch(recordFor('m-a', { lengthBeforeGoalSec: 7, replaySpeed: 0.25 }))
        useAppState.setState({ events: [goal('old')] }) // unsaved current match (saved first)
        expect(await openMatch('m-a')).toBe(true)
        expect(s().events.map((e) => e.id)).toEqual(['x'])
        expect(s().teams.map((t) => t.name)).toEqual(['Hawks', 'Lions'])
        expect(s().matchdayLabel).toBe('Matchday 9')
        expect(s().lengthBeforeGoalSec).toBe(7)
        expect(s().replaySpeed).toBe(0.25)
        expect(s().files).toEqual([])
        expect(s().undoStack).toEqual([])
        expect(s().redoStack).toEqual([])
        expect(openMatchStore.getState().id).toBe('m-a')
        expect(openMatchStore.getState().files.map((f) => f.name)).toEqual(['a.mp4'])
        expect(railTabStore.getState().tab).toBe('events')
        expect(cancelDetection).toHaveBeenCalled()
    })

    it('should return false and leave the state alone for an unknown id', async () => {
        useAppState.setState({ events: [goal('keep')] })
        expect(await openMatch('nope')).toBe(false)
        expect(s().events.map((e) => e.id)).toEqual(['keep'])
    })

    it('should save an unsaved current match before loading another', async () => {
        await putMatch(recordFor('m-a'))
        useAppState.setState({ events: [goal('mine')] })
        await openMatch('m-a')
        expect(await listMatches()).toHaveLength(2)
    })

    it('should start a new match keeping teams, emptying events, and keep the old record', async () => {
        useAppState.setState({ events: [goal('1')] })
        await startNewMatch()
        expect(s().events).toEqual([])
        expect(s().teams.map((t) => t.name)).toEqual(['Whites', 'Colours'])
        expect(openMatchStore.getState().id).toBeNull()
        expect(s().undoStack).toEqual([])
        expect(s().panel).toBe('newmatch')
        expect(railTabStore.getState().tab).toBe('events')
        expect(await listMatches()).toHaveLength(1)
    })

    it('should start a new match when deleting the open match, and Undo restores the record without reopening it', async () => {
        await putMatch(recordFor('m-a'))
        setOpenMatch('m-a')
        useAppState.setState({ events: [goal('x')] })
        await removeMatch('m-a')
        expect(await getMatch('m-a')).toBeNull()
        expect(s().events).toEqual([])
        expect(openMatchStore.getState().id).toBeNull()
        const toast = toastStore.getState().toast!
        expect(toast.text).toBe('Match deleted')
        toast.action!.run()
        await vi.waitFor(async () => expect(await getMatch('m-a')).not.toBeNull())
        expect(openMatchStore.getState().id).toBeNull()
    })

    it('should delete another match without touching the open one', async () => {
        await putMatch(recordFor('m-a'))
        await putMatch(recordFor('m-b'))
        setOpenMatch('m-b')
        useAppState.setState({ events: [goal('keep')] })
        await removeMatch('m-a')
        expect(openMatchStore.getState().id).toBe('m-b')
        expect(s().events.map((e) => e.id)).toEqual(['keep'])
    })

    it('should report a running render or Find goals run', () => {
        expect(switchBlocker()).toBeNull()
        vi.mocked(getDetectJob).mockReturnValue({ phase: 'running', ballPhase: 'idle' } as never)
        expect(switchBlocker()).toBe('detect')
        vi.mocked(getDetectJob).mockReturnValue({ phase: 'done', ballPhase: 'running' } as never)
        expect(switchBlocker()).toBe('detect')
        vi.mocked(getDetectJob).mockReturnValue({ phase: 'idle', ballPhase: 'idle' } as never)
        const jobs = renderJobs()
        const orig = jobs.getState()
        jobs.setState({ job: { phase: 'running' } as never })
        expect(switchBlocker()).toBe('render')
        stopBlocker()
        jobs.setState({ job: null })
        jobs.setState(orig)
    })
})

describe('loadMatch', () => {
    it('should not throw on empty data and keep numeric settings', () => {
        useAppState.setState({ lengthBeforeGoalSec: 12, replaySpeed: 0.25 })
        expect(() => useAppState.getState().loadMatch({} as MatchData)).not.toThrow()
        expect(useAppState.getState().lengthBeforeGoalSec).toBe(12)
        expect(useAppState.getState().replaySpeed).toBe(0.25)
        expect(useAppState.getState().events).toEqual([])
    })
})
