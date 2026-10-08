import { describe, it, expect } from 'vitest'
import { markersForFile, startInFile, homeTarget } from './markers'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#ffffff', roster: [] }, { name: 'Colours', color: '#ff0000', roster: [] }]
const ev = (id: string, file: number, t: number, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id, matchTimeSec: t, sourceFileIndex: file, type: 'goal', ...extra })

describe('startInFile', () => {
    it('should locate the global start inside the right file', () => {
        expect(startInFile(150, [0, 100], 1, 100)).toBe(50)
        expect(startInFile(150, [0, 100], 0, 100)).toBeNull()
        expect(startInFile(0, [0], 0, 100)).toBe(0)
    })
})

describe('markersForFile', () => {
    it('should place linked events of this file only, toned by type (never the kit colour)', () => {
        const events = [ev('a', 0, 25, { team: 'Colours', scorer: 'Jo' }), ev('b', 1, 10), ev('c', 0, 50, { unlinked: true })]
        const m = markersForFile({ events, fileIndex: 0, durationSec: 100, teams, cumulativeOffsets: [0, 100] })
        expect(m).toEqual([
            { id: 'a', kind: 'event', leftPct: 25, icon: '⚽', tone: 'goal', title: '00:25 Goal – Colours (Jo)' },
        ])
    })

    it('should tone a highlight as other and omit start in other files', () => {
        const m = markersForFile({ events: [ev('b', 1, 10, { type: 'highlight' })], fileIndex: 1, durationSec: 100, teams, cumulativeOffsets: [0, 100] })
        expect(m).toEqual([{ id: 'b', kind: 'event', leftPct: 10, icon: '★', tone: 'other', title: '00:10 Highlight' }])
    })

    it('should add a shortened note to the title', () => {
        const m = markersForFile({ events: [ev('b', 0, 10, { type: 'highlight', team: 'Whites', scorer: 'Sam', notes: 'nutmeg on the wing' })], fileIndex: 0, durationSec: 100, teams, cumulativeOffsets: [0] })
        expect(m.at(-1)?.title).toBe('00:10 Highlight – Whites (Sam) — nutmeg on the wing')
    })

    it('should draw Kick off and Final whistle flags in their file', () => {
        const events = [ev('k', 0, 20, { type: 'kick_off' }), ev('w', 0, 90, { type: 'final_whistle' }), ev('a', 0, 50)]
        const m = markersForFile({ events, fileIndex: 0, durationSec: 100, teams, cumulativeOffsets: [0] })
        expect(m.map((x) => [x.id, x.kind, x.leftPct])).toEqual([['k', 'kick_off', 20], ['w', 'final_whistle', 90], ['a', 'event', 50]])
        expect(m[0]).toMatchObject({ icon: '⚑', tone: 'marker', title: 'Kick off 00:20' })
        expect(m[1]).toMatchObject({ title: 'Final whistle 01:30' })
    })

    it('should return nothing without a duration', () => {
        expect(markersForFile({ events: [ev('a', 0, 5)], fileIndex: 0, durationSec: 0, teams, cumulativeOffsets: [0] })).toEqual([])
    })
})

describe('homeTarget', () => {
    it('should jump to the match start, then to 0 on a second press', () => {
        expect(homeTarget(300, 120)).toBe(120)
        expect(homeTarget(120.2, 120)).toBe(0)
        expect(homeTarget(60, 120)).toBe(0)
        expect(homeTarget(300, null)).toBe(0)
    })
})
