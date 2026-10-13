import { describe, it, expect } from 'vitest'
import {
    buildRecord, fileMetas, isEdit, isWorthSaving, matchDate, newMatchId, recordTitle, sameRecordData, summarise,
    type FileMeta, type MatchData, type MatchRecord, type RecordSource,
} from './matchRecord'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Hawks', color: '#fff', roster: [] }, { name: 'Lions', color: '#000', roster: [] }] as unknown as Team[]
const ev = (id: string, type: MatchEvent['type'], team?: string): MatchEvent => ({ id, type, matchTimeSec: 1, sourceFileIndex: 0, team }) as MatchEvent

function data(over: Partial<MatchData> = {}): MatchData {
    return {
        events: [], teams, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
        graphics: {} as never, fullMatch: {} as never, matchdayLabel: null, goalAreas: null, goalMarks: null, knownFinalScore: null,
        suggestions: [], suggestionRun: null, clipOptions: { replay: true, score: true }, ...over,
    }
}
const src = (over: Partial<RecordSource> = {}): RecordSource => ({ ...data(), files: [], ...over })

describe('newMatchId', () => {
    it('should be m-<timestamp>-<4 base36 chars>', () => {
        expect(newMatchId(1234, () => 0.5)).toMatch(/^m-1234-[0-9a-z]{4}$/)
    })
})

describe('isWorthSaving', () => {
    it('should need a file or an event', () => {
        expect(isWorthSaving({ files: [1], events: [] })).toBe(true)
        expect(isWorthSaving({ files: [], events: [1] })).toBe(true)
        expect(isWorthSaving({ files: [], events: [] })).toBe(false)
    })
})

describe('recordTitle', () => {
    it('should prefer the matchday, then the teams, then a placeholder', () => {
        expect(recordTitle({ matchdayLabel: ' Matchday 3 ', teams })).toBe('Matchday 3')
        expect(recordTitle({ matchdayLabel: ' ', teams })).toBe('Hawks v Lions')
        expect(recordTitle({ matchdayLabel: null, teams: [{ ...teams[0], name: '' }, teams[1]] })).toBe('Untitled match')
    })
})

describe('matchDate', () => {
    const m = (recordedAtMs?: number): FileMeta => ({ name: 'a', size: 1, key: 'a', recordedAtMs })
    it('should use the earliest recording, else the creation time', () => {
        expect(matchDate([m(500), m(200), m()], 9)).toBe(200)
        expect(matchDate([m()], 9)).toBe(9)
        expect(matchDate([], 9)).toBe(9)
    })
})

describe('fileMetas', () => {
    it('should give two files with one name distinct keys', () => {
        const metas = fileMetas([{ name: 'IMG_1.MOV', file: { size: 5 } }, { name: 'IMG_1.MOV', file: { size: 7 } }])
        expect(metas[0].key).not.toBe(metas[1].key)
        expect(metas[0]).toMatchObject({ name: 'IMG_1.MOV', size: 5 })
    })
})

describe('summarise', () => {
    it('should give the score and count events without markers', () => {
        const d = data({ events: [ev('1', 'goal', 'Hawks'), ev('2', 'goal', 'Hawks'), ev('3', 'goal', 'Lions'), ev('4', 'kick_off'), ev('5', 'final_whistle')] })
        const s = summarise(d, [], 42)
        expect(s.score).toEqual([2, 1])
        expect(s.eventCount).toBe(3)
        expect(s.title).toBe('Hawks v Lions')
        expect(s.teams).toEqual(['Hawks', 'Lions'])
        expect(s.dateMs).toBe(42)
    })
    it('should have no score without two teams', () => {
        const s = summarise(data({ teams: [] }), [], 1)
        expect(s.score).toBeNull()
        expect(s.teams).toBeNull()
    })
})

describe('buildRecord', () => {
    it('should start a new record at now', () => {
        const r = buildRecord(src({ files: [{ name: 'a.mp4', file: { size: 3 }, durationSec: 60 }] }), 'm-1', 100)
        expect(r).toMatchObject({ id: 'm-1', createdAt: 100, updatedAt: 100 })
        expect(r.files).toHaveLength(1)
        expect(r.summary.fileCount).toBe(1)
    })
    it('should keep createdAt and the file list when the videos are not linked', () => {
        const first = buildRecord(src({ files: [{ name: 'a.mp4', file: { size: 3 } }] }), 'm-1', 100)
        const next = buildRecord(src({ events: [ev('1', 'goal', 'Hawks')] }), 'm-1', 200, first)
        expect(next.createdAt).toBe(100)
        expect(next.updatedAt).toBe(200)
        expect(next.files).toEqual(first.files)
        expect(next.summary.fileCount).toBe(1)
    })
})

describe('sameRecordData', () => {
    it('should ignore updatedAt', () => {
        const a = buildRecord(src(), 'm-1', 100)
        expect(sameRecordData(a, { ...a, updatedAt: 999 })).toBe(true)
        expect(sameRecordData(a, buildRecord(src({ matchdayLabel: 'x' }), 'm-1', 100))).toBe(false)
    })
})

describe('isEdit', () => {
    const base = (): MatchRecord => ({
        id: 'm', createdAt: 1, updatedAt: 2, summary: {} as MatchRecord['summary'],
        data: { events: [{ id: 'a', type: 'goal', matchTimeSec: 1 }] } as unknown as MatchRecord['data'],
        files: [{ name: 'a.mp4', size: 0, key: 'a.mp4' }, { name: 'b.mp4', size: 0, key: 'b.mp4' }],
    })
    it('should ignore file size, duration and event key order', () => {
        const b = base()
        b.files = b.files.map((f) => ({ ...f, size: 99, durationSec: 5 }))
        b.data = { events: [{ matchTimeSec: 1, type: 'goal', id: 'a' }] } as unknown as MatchRecord['data']
        expect(isEdit(base(), b)).toBe(false)
    })
    it('should count added, removed or reordered files and event changes', () => {
        const r = base(); r.files = [r.files[1], r.files[0]]
        expect(isEdit(base(), r)).toBe(true)
        const d = base(); d.files = d.files.slice(0, 1)
        expect(isEdit(base(), d)).toBe(true)
        const e = base(); e.data = { events: [{ id: 'a', type: 'goal', matchTimeSec: 2 }] } as unknown as MatchRecord['data']
        expect(isEdit(base(), e)).toBe(true)
    })
})
