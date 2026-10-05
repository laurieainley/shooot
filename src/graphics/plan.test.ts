import { describe, it, expect } from 'vitest'
import { buildGraphicsSpec, wantsLowerThird, type GraphicsSettings } from './plan'
import type { MatchEvent, Team } from '../types'
import type { Cut } from '../render/types'

const teams: Team[] = [
    { name: "Ryan's Rovers", color: '#f0f0f0', roster: [] },
    { name: 'Walford Town', color: '#ec5fa4', roster: [], initials: 'WT' },
]
const ALL: GraphicsSettings = { cards: true, lowerThirds: true, replayTag: false }
const ev = (id: string, t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })
const cuts: Cut[] = [
    { sourceIndex: 0, startSec: 10, endSec: 24 },
    { sourceIndex: 0, startSec: 16, endSec: 21, speed: 0.5, gain: 0.5 },
    { sourceIndex: 0, startSec: 50, endSec: 64 },
]
const build = (events: MatchEvent[], settings = ALL, c = cuts) =>
    buildGraphicsSpec({ events, teams, cuts: c, cumulativeOffsets: [0], settings, matchday: 'Matchday 3' })

describe('wantsLowerThird', () => {
    it('should cover goals, own goals, penalties and highlights with a note', () => {
        expect(wantsLowerThird({ type: 'goal' })).toBe(true)
        expect(wantsLowerThird({ type: 'goal', pen: true })).toBe(true)
        expect(wantsLowerThird({ type: 'own_goal' })).toBe(true)
        expect(wantsLowerThird({ type: 'penalty_missed' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight', notes: 'Nutmeg' })).toBe(true)
    })

    it('should skip saves, fouls, awarded penalties and highlights without a note', () => {
        expect(wantsLowerThird({ type: 'save' })).toBe(false)
        expect(wantsLowerThird({ type: 'foul', notes: 'late' })).toBe(false)
        expect(wantsLowerThird({ type: 'penalty_awarded' })).toBe(false)
        expect(wantsLowerThird({ type: 'highlight', notes: '  ' })).toBe(false)
    })
})

describe('buildGraphicsSpec', () => {
    it('should make VS and full-time cards with the final score', () => {
        const spec = build([ev('a', 20, { team: "Ryan's Rovers" }), ev('b', 60, { team: 'Walford Town' }), ev('c', 62, { type: 'own_goal', team: 'Walford Town' })])
        expect(spec.intro).toMatchObject({ heading: 'MATCHDAY 3', centre: 'VS', left: { initials: 'RR', name: "RYAN'S ROVERS" }, right: { initials: 'WT' } })
        expect(spec.outro).toMatchObject({ heading: 'FULL TIME', centre: '1 - 2' })
    })

    it('should leave cards out when turned off', () => {
        const spec = build([ev('a', 20, {})], { ...ALL, cards: false })
        expect(spec.intro).toBeUndefined()
        expect(spec.outro).toBeUndefined()
    })

    it('should put a lower third with the running score on the clip containing each goal', () => {
        const spec = build([ev('a', 20, { team: "Ryan's Rovers", scorer: 'Sam' }), ev('b', 55, { team: 'Walford Town', scorer: 'Alex', pen: true })])
        expect(spec.overlays).toEqual([
            expect.objectContaining({ kind: 'lowerThird', cutIndex: 0, startSec: 20, durationSec: 3, spec: { label: 'GOAL', person: 'SAM', stripe: '#f0f0f0', score: { left: 'RR', right: 'WT', text: '1–0' } } }),
            expect.objectContaining({ kind: 'lowerThird', cutIndex: 2, startSec: 55, spec: expect.objectContaining({ label: 'GOAL (PEN)', person: 'ALEX', stripe: '#ec5fa4', score: { left: 'RR', right: 'WT', text: '1–1' } }) }),
        ])
    })

    it('should credit an own goal to the team it counts for', () => {
        const spec = build([ev('a', 20, { type: 'own_goal', team: 'Walford Town', scorer: 'Smith' })])
        expect(spec.overlays[0]).toMatchObject({ spec: { label: 'OWN GOAL', person: 'SMITH', stripe: '#ec5fa4', score: { text: '0–1' } } })
    })

    it('should show a highlight note without a score, and use orange without a team', () => {
        const spec = build([ev('h', 52, { type: 'highlight', scorer: 'Jo', notes: 'nutmeg on the wing' })])
        expect(spec.overlays[0]).toMatchObject({ cutIndex: 2, spec: { label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: '#f28c28' } })
        expect(spec.overlays[0].kind === 'lowerThird' && spec.overlays[0].spec.score).toBeUndefined()
    })

    it('should end a lower third inside its clip', () => {
        const spec = build([ev('a', 23, { team: "Ryan's Rovers" })])
        expect(spec.overlays[0]).toMatchObject({ cutIndex: 0, startSec: 21, durationSec: 3 })
    })

    it('should shorten a lower third that the next one interrupts', () => {
        const spec = build([ev('a', 52, { team: "Ryan's Rovers" }), ev('b', 53.5, { team: 'Walford Town' })])
        expect(spec.overlays.map((o) => [o.startSec, o.durationSec])).toEqual([[52, 1.5], [53.5, 3]])
    })

    it('should skip lower thirds when turned off, and for unlinked or unwanted events', () => {
        expect(build([ev('a', 20, {})], { ...ALL, lowerThirds: false }).overlays).toEqual([])
        expect(build([ev('a', 20, { unlinked: true }), ev('s', 21, { type: 'save' })]).overlays).toEqual([])
    })

    it('should never put a lower third on a slowed replay', () => {
        const spec = build([ev('a', 18, {})], ALL, [cuts[1], cuts[0]])
        expect(spec.overlays[0]).toMatchObject({ cutIndex: 1 })
    })

    it('should tag replays when asked', () => {
        const spec = build([], { cards: false, lowerThirds: false, replayTag: true })
        expect(spec.overlays).toEqual([expect.objectContaining({ kind: 'replayTag', cutIndex: 1, startSec: 16, durationSec: 5 })])
    })
})
