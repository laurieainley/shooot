import { describe, it, expect } from 'vitest'
import { buildMatchStrip, globalToFileTime } from './matchStrip'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#3a6ea5', roster: [] }, { name: 'Colours', color: '#c2364a', roster: [] }]
const files = [{ name: 'a.mp4', durationSec: 600 }, { name: 'b.mp4', durationSec: 400 }]
const offsets = [0, 600]
const ev = (id: string, f: number, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: f, type: 'goal', ...extra })

describe('globalToFileTime', () => {
    it('should map global seconds to file and local time', () => {
        expect(globalToFileTime(offsets, [600, 400], 650)).toEqual({ fileIndex: 1, timeSec: 50 })
        expect(globalToFileTime(offsets, [600, 400], 10)).toEqual({ fileIndex: 0, timeSec: 10 })
    })
    it('should clamp beyond the ends', () => {
        expect(globalToFileTime(offsets, [600, 400], -5)).toEqual({ fileIndex: 0, timeSec: 0 })
        expect(globalToFileTime(offsets, [600, 400], 2000)).toEqual({ fileIndex: 1, timeSec: 400 })
    })
})

describe('buildMatchStrip', () => {
    const base = { files, cumulativeOffsets: offsets, teams, currentFileIndex: 1, currentTimeSec: 100, before: 10, after: 4 }

    it('should lay files end to end by duration', () => {
        const s = buildMatchStrip({ ...base, events: [] })
        expect(s.totalSec).toBe(1000)
        expect(s.flags).toEqual([])
        expect(s.files).toEqual([
            { name: 'a.mp4', leftPct: 0, widthPct: 60 },
            { name: 'b.mp4', leftPct: 60, widthPct: 40 },
        ])
        expect(s.playheadPct).toBe(70)
    })

    it('should draw Kick off and Final whistle as flags, not dots or clips', () => {
        const s = buildMatchStrip({ ...base, events: [ev('k', 0, 100, { type: 'kick_off' }), ev('w', 1, 300, { type: 'final_whistle' })] })
        expect(s.flags).toEqual([
            { id: 'k', kind: 'kick_off', leftPct: 10, title: 'Kick off 01:40' },
            { id: 'w', kind: 'final_whistle', leftPct: 90, title: 'Final whistle 15:00' },
        ])
        expect(s.events).toEqual([])
        expect(s.clips).toEqual([])
    })

    it('should place event ticks in global time, lime for goals, skipping unlinked', () => {
        const s = buildMatchStrip({ ...base, events: [ev('a', 1, 100, { team: 'Colours' }), ev('b', 0, 50, { unlinked: true })] })
        expect(s.events).toEqual([{ id: 'a', leftPct: 70, tick: 'goal', title: expect.stringContaining('Goal'), kind: 'goal' }])
    })

    it('should add a shortened note to the dot title', () => {
        const s = buildMatchStrip({ ...base, events: [ev('a', 0, 100, { type: 'foul', team: 'Colours', notes: 'late tackle' })] })
        expect(s.events[0].title).toMatch(/Foul – Colours — late tackle$/)
    })

    it('should draw other moments as grey ticks and own goals with an OG label, ignoring team colours', () => {
        const s = buildMatchStrip({ ...base, events: [ev('h', 0, 50, { type: 'highlight', team: 'Colours' }), ev('o', 0, 60, { type: 'own_goal' }), ev('m', 0, 70, { type: 'penalty_missed' })] })
        expect(s.events.map((e) => [e.id, e.tick, e.label])).toEqual([['h', 'other', undefined], ['o', 'own-goal', 'OG'], ['m', 'miss', undefined]])
        expect(s.events[0]).not.toHaveProperty('color')
    })

    it('should draw clip spans from merged segments, splitting across files', () => {
        const s = buildMatchStrip({ ...base, events: [ev('a', 1, 5)] })
        // window 5-10 = -5 .. 9 in file 1 → global 595 .. 609
        expect(s.clips).toEqual([{ leftPct: 59.5, widthPct: 1.4 }])
    })

    it('should return an empty strip without durations', () => {
        const s = buildMatchStrip({ ...base, files: [{ name: 'x', durationSec: undefined }], cumulativeOffsets: [0], events: [] })
        expect(s.totalSec).toBe(0)
        expect(s.files).toEqual([])
    })
})
