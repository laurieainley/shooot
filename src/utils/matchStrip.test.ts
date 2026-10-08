import { describe, it, expect } from 'vitest'
import { buildMatchStrip, globalToFileTime, stackLanes } from './matchStrip'
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

    it('should place event icons in global time, skipping unlinked', () => {
        const s = buildMatchStrip({ ...base, events: [ev('a', 1, 100, { team: 'Colours' }), ev('b', 0, 50, { unlinked: true })] })
        expect(s.events).toEqual([{ id: 'a', leftPct: 70, pen: false, title: expect.stringContaining('Goal'), kind: 'goal' }])
    })

    it('should add a shortened note to the dot title', () => {
        const s = buildMatchStrip({ ...base, events: [ev('a', 0, 100, { type: 'foul', team: 'Colours', notes: 'late tackle' })] })
        expect(s.events[0].title).toMatch(/Foul – Colours — late tackle$/)
    })

    it('should carry the type and penalty flag for the icon, never the team colour', () => {
        const s = buildMatchStrip({ ...base, events: [ev('h', 0, 50, { type: 'highlight', team: 'Colours' }), ev('p', 0, 60, { pen: true }), ev('m', 0, 70, { type: 'penalty_missed' })] })
        expect(s.events.map((e) => [e.id, e.kind, e.pen])).toEqual([['h', 'highlight', false], ['p', 'goal', true], ['m', 'penalty_missed', false]])
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

describe('stackLanes', () => {
    it('should keep icons that are far apart in lane 0', () => {
        expect(stackLanes([10, 50, 90], 1000, 16)).toEqual([0, 0, 0])
    })
    it('should lift an icon that would overlap the previous one onto the next lane', () => {
        // 1000 px track: 1% = 10 px, 16 px icons overlap when closer than 1.6%
        expect(stackLanes([10, 10.5, 11], 1000, 16)).toEqual([0, 1, 2])
    })
    it('should drop back to lane 0 once there is room again', () => {
        expect(stackLanes([10, 10.5, 30], 1000, 16)).toEqual([0, 1, 0])
    })
    it('should never overlap two icons in the same lane while a lane is free', () => {
        const pcts = Array.from({ length: 40 }, (_, i) => 20 + i * 0.4)
        const lanes = stackLanes(pcts, 1000, 16, 4)
        const last: number[] = []
        pcts.forEach((p, i) => {
            const prev = last[lanes[i]]
            if (prev !== undefined && lanes[i] < 3) expect((p - prev) * 10).toBeGreaterThanOrEqual(16 - 1e-6)
            last[lanes[i]] = p
        })
    })
    it('should keep every icon (cap the lane, never drop one)', () => {
        const lanes = stackLanes([10, 10, 10, 10, 10, 10], 1000, 16, 3)
        expect(lanes).toHaveLength(6)
        expect(Math.max(...lanes)).toBe(2)
    })
    it('should return lanes in input order whatever the sort', () => {
        expect(stackLanes([50, 10, 10.2], 1000, 16)).toEqual([0, 0, 1])
    })
})
