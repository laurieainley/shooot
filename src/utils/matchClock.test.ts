import { describe, it, expect } from 'vitest'
import { finalWhistleSec, kickOffSec, resolveGlobalEvents, withMigratedKickOff } from './matchClock'
import type { MatchEvent } from '../types'

const ev = (id: string, type: MatchEvent['type'], t: number, file = 0, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id, type, matchTimeSec: t, sourceFileIndex: file, ...extra })

describe('kickOffSec / finalWhistleSec', () => {
    it('should place markers on the whole timeline', () => {
        const events = [ev('g', 'goal', 5), ev('k', 'kick_off', 30, 0), ev('w', 'final_whistle', 40, 1)]
        expect(kickOffSec(events, [0, 100])).toBe(30)
        expect(finalWhistleSec(events, [0, 100])).toBe(140)
    })

    it('should be 0 / null without markers, and ignore unlinked ones', () => {
        expect(kickOffSec([ev('g', 'goal', 5)], [0])).toBe(0)
        expect(finalWhistleSec([ev('g', 'goal', 5)], [0])).toBeNull()
        expect(kickOffSec([ev('k', 'kick_off', 30, 0, { unlinked: true })], [0])).toBe(0)
    })

    it('should use the global time of a migrated kick-off that is not yet placed in a file', () => {
        expect(kickOffSec([ev('k', 'kick_off', 0, 0, { globalTimeSec: 610 })], [])).toBe(610)
    })
})

describe('withMigratedKickOff', () => {
    it('should turn an old match start into a pending Kick off event', () => {
        const out = withMigratedKickOff([ev('g', 'goal', 5)], 610)
        expect(out).toHaveLength(2)
        expect(out[1]).toMatchObject({ type: 'kick_off', globalTimeSec: 610, matchTimeSec: 610, sourceFileIndex: 0 })
    })

    it('should leave events alone when there is no start or already a Kick off', () => {
        const events = [ev('k', 'kick_off', 30)]
        expect(withMigratedKickOff(events, 610)).toBe(events)
        expect(withMigratedKickOff([], 0)).toEqual([])
    })
})

describe('resolveGlobalEvents', () => {
    const pending = ev('k', 'kick_off', 610, 0, { globalTimeSec: 610 })
    const files = [{ name: 'a.mp4', durationSec: 500 }, { name: 'b.mp4', durationSec: 500 }]

    it('should map a pending event to its file and time once loaded files cover it', () => {
        const [k] = resolveGlobalEvents([pending], files)
        expect(k).toMatchObject({ sourceFileIndex: 1, matchTimeSec: 110 })
        expect(k.globalTimeSec).toBeUndefined()
    })

    it('should wait while the loaded files do not reach it yet', () => {
        expect(resolveGlobalEvents([pending], files.slice(0, 1))).toEqual([pending])
        expect(resolveGlobalEvents([pending], [{ name: 'a.mp4' }, files[1]])).toEqual([pending])
    })

    it('should return the same array when nothing is pending', () => {
        const events = [ev('g', 'goal', 5)]
        expect(resolveGlobalEvents(events, files)).toBe(events)
    })
})
