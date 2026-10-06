import { describe, it, expect } from 'vitest'
import { buildGraphicsSpec, fullMatchGraphicsSpec, wantsLowerThird, type GraphicsSettings } from './plan'
import type { MatchEvent, Team } from '../types'
import type { Cut } from '../render/types'

const teams: Team[] = [
    { name: "Ryan's Rovers", color: '#f0f0f0', roster: [] },
    { name: 'Walford Town', color: '#ec5fa4', roster: [], initials: 'WT' },
]
const ALL: GraphicsSettings = { cards: true, lowerThirds: true, replayTag: false, scoreBug: false }
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

    it('should head the card MATCH when no matchday is set', () => {
        const spec = buildGraphicsSpec({ events: [], teams, cuts, cumulativeOffsets: [0], settings: ALL, matchday: '  ' })
        expect(spec.intro?.heading).toBe('MATCH')
    })

    it('should leave cards out when turned off', () => {
        const spec = build([ev('a', 20, {})], { ...ALL, cards: false })
        expect(spec.intro).toBeUndefined()
        expect(spec.outro).toBeUndefined()
    })

    it('should put a caption with the score after it on the clip containing each goal, for 5 s', () => {
        const spec = build([ev('a', 20, { team: "Ryan's Rovers", scorer: 'Sam' }), ev('b', 55, { team: 'Walford Town', scorer: 'Alex', pen: true })])
        const bug = (text: string) => ({ left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text })
        expect(spec.overlays).toEqual([
            // 4 s left in the clip: the caption starts at the goal and carries on over the start of its replay (slowed 2×)
            expect.objectContaining({ kind: 'caption', cutIndex: 0, startSec: 20, durationSec: 4, anchored: false, clock: { offsetSec: 0, rate: 1, totalSec: 5 }, spec: { label: 'GOAL', person: 'SAM', stripe: '#f0f0f0', bug: bug('1–0') } }),
            expect.objectContaining({ kind: 'caption', cutIndex: 1, startSec: 16, durationSec: 0.5, clock: { offsetSec: 4, rate: 2, totalSec: 5 }, fromCutStart: true }),
            expect.objectContaining({ kind: 'caption', cutIndex: 2, startSec: 55, durationSec: 5, spec: expect.objectContaining({ label: 'GOAL (PEN)', person: 'ALEX', stripe: '#ec5fa4', bug: bug('1–1') }) }),
        ])
    })

    it('should credit an own goal to the team it counts for', () => {
        const spec = build([ev('a', 20, { type: 'own_goal', team: 'Walford Town', scorer: 'Smith' })])
        expect(spec.overlays[0]).toMatchObject({ spec: { label: 'OWN GOAL', person: 'SMITH', stripe: '#ec5fa4', bug: { text: '0–1' } } })
    })

    it('should show the current score on a highlight caption, and use orange without a team', () => {
        const spec = build([ev('g', 20, { team: 'Walford Town' }), ev('h', 52, { type: 'highlight', scorer: 'Jo', notes: 'nutmeg on the wing' })], { ...ALL })
        expect(spec.overlays.at(-1)).toMatchObject({ cutIndex: 2, spec: { label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: '#f28c28', bug: { text: '0–1' } } })
    })

    it('should start a caption at its event and end it with its clip when no replay follows', () => {
        const spec = build([ev('a', 61, { team: "Ryan's Rovers" })])
        expect(spec.overlays).toEqual([expect.objectContaining({ cutIndex: 2, startSec: 61, durationSec: 3 })])
    })

    it('should shorten a caption that the next one interrupts', () => {
        const spec = build([ev('a', 52, { team: "Ryan's Rovers" }), ev('b', 53.5, { team: 'Walford Town' })])
        expect(spec.overlays.map((o) => [o.startSec, o.durationSec])).toEqual([[52, 1.5], [53.5, 5]])
    })

    it('should skip captions when turned off, and for unlinked, unwanted or marker events', () => {
        expect(build([ev('a', 20, {})], { ...ALL, lowerThirds: false }).overlays).toEqual([])
        expect(build([ev('a', 20, { unlinked: true }), ev('s', 21, { type: 'save' }), ev('k', 22, { type: 'kick_off' })]).overlays).toEqual([])
    })

    it('should never put a caption on a slowed replay', () => {
        const spec = build([ev('a', 18, {})], ALL, [cuts[1], cuts[0]])
        expect(spec.overlays[0]).toMatchObject({ cutIndex: 1 })
    })

    it('should tag replays when asked', () => {
        const spec = build([], { cards: false, lowerThirds: false, replayTag: true, scoreBug: false })
        expect(spec.overlays).toEqual([expect.objectContaining({ kind: 'replayTag', cutIndex: 1, startSec: 16, durationSec: 5 })])
    })
})

describe('buildGraphicsSpec — score always on screen', () => {
    const ON: GraphicsSettings = { ...ALL, scoreBug: true }
    const bugs = (spec: ReturnType<typeof build>) => spec.overlays.filter((o) => o.kind === 'scoreBug')

    it('should cover every cut, replays included, updating at each goal and hiding under captions', () => {
        const spec = build([ev('a', 20, { team: "Ryan's Rovers" }), ev('b', 60, { team: 'Walford Town' })], ON)
        const [c0, c1, c2] = bugs(spec)
        expect(c0).toMatchObject({ cutIndex: 0, startSec: 10, durationSec: 14, fadeIn: false, fadeOut: false, hide: [[20, 24]] })
        // a caption carried on over a replay starts with the replay's real first frame: the bug stays drawn under it
        // (the anchored caption repeats the same bug row), so there is never a frame with neither
        expect(c1).toMatchObject({ cutIndex: 1, hide: [] })
        expect(c0.kind === 'scoreBug' && c0.scores.map((x) => [x.fromSec, x.bug.text])).toEqual([[10, '0–0'], [20, '1–0']])
        // the replay of the first goal shows the score after it throughout
        expect(c1.kind === 'scoreBug' && c1.scores.map((x) => [x.fromSec, x.bug.text])).toEqual([[16, '1–0']])
        expect(c2.kind === 'scoreBug' && c2.scores.map((x) => [x.fromSec, x.bug.text])).toEqual([[50, '1–0'], [60, '1–1']])
        expect(spec.overlays.filter((o) => o.kind === 'caption').every((o) => o.kind === 'caption' && o.anchored)).toBe(true)
    })

    it('should draw nothing without two teams', () => {
        const spec = buildGraphicsSpec({ events: [], teams: teams.slice(0, 1), cuts, cumulativeOffsets: [0], settings: ON, matchday: '' })
        expect(spec.overlays.filter((o) => o.kind === 'scoreBug')).toEqual([])
    })
})

describe('fullMatchGraphicsSpec', () => {
    const fmCuts: Cut[] = [{ sourceIndex: 0, startSec: 30, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 50 }]
    const events = [ev('k', 30, { type: 'kick_off' }), ev('g', 95, { team: "Ryan's Rovers" }), ev('w', 50, { type: 'final_whistle', sourceFileIndex: 1 })]
    const args = { events, teams, cuts: fmCuts, cumulativeOffsets: [0, 100], cards: true, matchday: 'Cup', windows: [
        { startSec: 30, durationSec: 8, score: [0, 0] as [number, number] },
        { startSec: 95, durationSec: 10, score: [1, 0] as [number, number] },
    ] }

    it('should map score bug windows onto the cuts, splitting at a file join without fading there', () => {
        const spec = fullMatchGraphicsSpec(args)
        expect(spec.overlays.map((o) => o.kind === 'scoreBug' && [o.cutIndex, o.startSec, o.durationSec, o.fadeIn, o.fadeOut, o.scores[0].bug.text])).toEqual([
            [0, 30, 8, true, true, '0–0'],
            [0, 95, 5, true, false, '1–0'],
            [1, 0, 5, false, true, '1–0'],
        ])
    })

    it('should add VS and full-time cards only when asked', () => {
        expect(fullMatchGraphicsSpec(args).intro).toMatchObject({ heading: 'CUP', centre: 'VS' })
        expect(fullMatchGraphicsSpec(args).outro).toMatchObject({ heading: 'FULL TIME', centre: '1 - 0' })
        expect(fullMatchGraphicsSpec({ ...args, cards: false }).intro).toBeUndefined()
    })
})
