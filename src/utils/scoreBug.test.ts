import { describe, it, expect } from 'vitest'
import { scoreBugWindows, subtractIntervals } from './scoreBug'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }]
const goal = (id: string, t: number, team = 'Whites'): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', team })
const base = { teams, cumulativeOffsets: [0], kickOffSec: 100, finalWhistleSec: 100 + 30 * 60, intervalMin: 5, gapsSec: [] as number[] }
const spans = (w: ReturnType<typeof scoreBugWindows>) => w.map((x) => [x.startSec, x.durationSec, x.score.join('-')])

describe('scoreBugWindows', () => {
    it('should show nothing when off', () => {
        expect(scoreBugWindows({ ...base, events: [goal('a', 400)], mode: 'off' })).toEqual([])
    })

    it('should show the new score for 10 s after each goal in "after goals" mode', () => {
        expect(spans(scoreBugWindows({ ...base, events: [goal('a', 400), goal('b', 900, 'Colours')], mode: 'goals' })))
            .toEqual([[400, 10, '1-0'], [900, 10, '1-1']])
    })

    it('should add 8 s at kick-off and every 5 minutes for 5 s in periodic mode', () => {
        const w = scoreBugWindows({ ...base, events: [], mode: 'periodic' })
        expect(spans(w)).toEqual([[100, 8, '0-0'], [400, 5, '0-0'], [700, 5, '0-0'], [1000, 5, '0-0'], [1300, 5, '0-0'], [1600, 5, '0-0']])
    })

    it('should follow the interval setting, kept between 2 and 15 minutes', () => {
        expect(scoreBugWindows({ ...base, events: [], mode: 'periodic', intervalMin: 15 }).map((x) => x.startSec)).toEqual([100, 1000])
        expect(scoreBugWindows({ ...base, events: [], mode: 'periodic', intervalMin: 1 }).map((x) => x.startSec).slice(0, 3)).toEqual([100, 220, 340])
        expect(scoreBugWindows({ ...base, events: [], mode: 'periodic', intervalMin: 60 }).map((x) => x.startSec)).toEqual([100, 1000])
    })

    it('should show 8 s after a half-time gap', () => {
        const w = scoreBugWindows({ ...base, events: [], mode: 'periodic', gapsSec: [1150], intervalMin: 15 })
        expect(spans(w)).toEqual([[100, 8, '0-0'], [1000, 5, '0-0'], [1150, 8, '0-0']])
    })

    it('should merge overlapping windows and split them where a goal changes the score', () => {
        const w = scoreBugWindows({ ...base, events: [goal('a', 398)], mode: 'periodic', intervalMin: 5 })
        expect(spans(w).slice(0, 2)).toEqual([[100, 8, '0-0'], [398, 10, '1-0']])
        const w2 = scoreBugWindows({ ...base, events: [goal('a', 402)], mode: 'periodic', intervalMin: 5 })
        expect(spans(w2).slice(1, 3)).toEqual([[400, 2, '0-0'], [402, 10, '1-0']])
    })

    it('should clamp to the match: nothing before kick-off or after the final whistle (where the cards go)', () => {
        const w = scoreBugWindows({ ...base, events: [goal('early', 50), goal('late', base.finalWhistleSec - 4)], mode: 'goals' })
        expect(spans(w)).toEqual([[base.finalWhistleSec - 4, 4, '2-0']])
    })

    it('should use the end of the footage when there is no final whistle', () => {
        const w = scoreBugWindows({ ...base, finalWhistleSec: 420, events: [], mode: 'periodic' })
        expect(spans(w)).toEqual([[100, 8, '0-0'], [400, 5, '0-0']])
    })
})

describe('subtractIntervals', () => {
    const w = (startSec: number, durationSec: number) => ({ startSec, durationSec, score: [1, 0] as [number, number] })
    it('should split a window around an interval keeping its score', () => {
        expect(subtractIntervals([w(60, 10)], [{ startSec: 61, durationSec: 5 }])).toEqual([w(60, 1), w(66, 4)])
    })
    it('should drop a window an interval covers and keep untouched ones', () => {
        expect(subtractIntervals([w(60, 4), w(100, 5)], [{ startSec: 59, durationSec: 6 }])).toEqual([w(100, 5)])
    })
    it('should trim a window start or end and handle several intervals', () => {
        expect(subtractIntervals([w(60, 20)], [{ startSec: 50, durationSec: 15 }, { startSec: 70, durationSec: 2 }, { startSec: 78, durationSec: 10 }])).toEqual([w(65, 5), w(72, 6)])
    })
    it('should return the windows unchanged without intervals', () => {
        expect(subtractIntervals([w(1, 2)], [])).toEqual([w(1, 2)])
    })
})
