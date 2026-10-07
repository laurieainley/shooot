import { describe, it, expect } from 'vitest'
import { buildGraphicsSpec, fullMatchCaptionWindows, fullMatchGraphicsSpec, wantsFullMatchCaption, wantsLowerThird, type GraphicsSettings } from './plan'
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
    it('should cover goals, own goals, penalties and every highlight', () => {
        expect(wantsLowerThird({ type: 'goal' })).toBe(true)
        expect(wantsLowerThird({ type: 'goal', pen: true })).toBe(true)
        expect(wantsLowerThird({ type: 'own_goal' })).toBe(true)
        expect(wantsLowerThird({ type: 'penalty_missed' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight', notes: 'Nutmeg' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight', notes: '  ' })).toBe(true)
    })

    it('should skip saves, fouls and conceded penalties', () => {
        expect(wantsLowerThird({ type: 'save' })).toBe(false)
        expect(wantsLowerThird({ type: 'foul', notes: 'late' })).toBe(false)
        expect(wantsLowerThird({ type: 'penalty_conceded' })).toBe(false)
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

    it('should put a caption with the score after it on the clip containing each goal, for 5 s starting 1 s after the event', () => {
        const spec = build([ev('a', 20, { team: "Ryan's Rovers", scorer: 'Sam' }), ev('b', 55, { team: 'Walford Town', scorer: 'Alex', pen: true })])
        const bug = (text: string) => ({ left: 'RR', right: 'WT', leftColour: '#f0f0f0', rightColour: '#ec5fa4', text })
        expect(spec.overlays).toEqual([
            // starts 1 s after the goal; 3 s left in the clip, then it carries on over the start of its replay (slowed 2×)
            expect.objectContaining({ kind: 'caption', cutIndex: 0, startSec: 21, durationSec: 3, toCutEnd: true, clock: { offsetSec: 0, rate: 1, totalSec: 5 }, spec: { label: 'GOAL', person: 'SAM', stripe: '#f0f0f0', bug: bug('1–0') } }),
            expect.objectContaining({ kind: 'caption', cutIndex: 1, startSec: 16, durationSec: 1, clock: { offsetSec: 3, rate: 2, totalSec: 5 }, fromCutStart: true }),
            expect.objectContaining({ kind: 'caption', cutIndex: 2, startSec: 56, durationSec: 5, spec: expect.objectContaining({ label: 'GOAL (PEN)', person: 'ALEX', stripe: '#ec5fa4', bug: bug('1–1') }) }),
        ])
    })

    it('should carry a goal note on the caption', () => {
        const spec = build([ev('a', 20, { team: 'Walford Town', scorer: 'Sam', notes: 'top corner' })])
        expect(spec.overlays[0]).toMatchObject({ spec: { label: 'GOAL', person: 'SAM', note: 'TOP CORNER' } })
    })

    it('should credit an own goal to the team it counts for', () => {
        const spec = build([ev('a', 20, { type: 'own_goal', team: 'Walford Town', scorer: 'Smith' })])
        expect(spec.overlays[0]).toMatchObject({ spec: { label: 'OWN GOAL', person: 'SMITH', stripe: '#ec5fa4', bug: { text: '0–1' } } })
    })

    it('should show the current score on a highlight caption, and use orange without a team', () => {
        const spec = build([ev('g', 20, { team: 'Walford Town' }), ev('h', 52, { type: 'highlight', scorer: 'Jo', notes: 'nutmeg on the wing' })], { ...ALL })
        expect(spec.overlays.at(-1)).toMatchObject({ cutIndex: 2, startSec: 50, spec: { label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: '#f28c28', bug: { text: '0–1' } } })
    })

    it('should show a highlight caption at the start of its clip for 5 s, with the note', () => {
        const spec = build([ev('h', 55, { type: 'highlight', scorer: 'Jo', notes: 'nutmeg on the wing' })])
        expect(spec.overlays).toEqual([expect.objectContaining({
            kind: 'caption', cutIndex: 2, startSec: 50, durationSec: 5, fromCutStart: true,
            clock: { offsetSec: 0, rate: 1, totalSec: 5 }, spec: expect.objectContaining({ label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING' }),
        })])
    })

    it('should caption a highlight without a note with just HIGHLIGHT', () => {
        const spec = build([ev('h', 55, { type: 'highlight' })])
        const cap = spec.overlays[0]
        expect(cap).toMatchObject({ kind: 'caption', startSec: 50 })
        expect(cap.kind === 'caption' && cap.spec.label).toBe('HIGHLIGHT')
        expect(cap.kind === 'caption' && 'note' in cap.spec).toBe(false)
        expect(cap.kind === 'caption' && 'person' in cap.spec).toBe(false)
    })

    it('should start a caption 1 s after its event and end it with its clip when no replay follows', () => {
        const spec = build([ev('a', 61, { team: "Ryan's Rovers" })])
        expect(spec.overlays).toEqual([expect.objectContaining({ cutIndex: 2, startSec: 62, durationSec: 2 })])
    })

    it('should shorten a caption that the next one interrupts', () => {
        const spec = build([ev('a', 52, { team: "Ryan's Rovers" }), ev('b', 53.5, { team: 'Walford Town' })])
        expect(spec.overlays.map((o) => [o.startSec, o.durationSec])).toEqual([[53, 1.5], [54.5, 5]])
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
        const spec = build([], { cards: false, lowerThirds: false, replayTag: true })
        expect(spec.overlays).toEqual([expect.objectContaining({ kind: 'replayTag', cutIndex: 1, startSec: 16, durationSec: 5 })])
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

describe('wantsFullMatchCaption', () => {
    it('should cover goals, penalties, own goals, conceded and missed penalties only', () => {
        for (const e of [{ type: 'goal' }, { type: 'goal', pen: true }, { type: 'own_goal' }, { type: 'penalty_conceded' }, { type: 'penalty_missed' }] as const) expect(wantsFullMatchCaption(e)).toBe(true)
        for (const e of [{ type: 'save' }, { type: 'foul' }, { type: 'highlight', notes: 'x' }, { type: 'kick_off' }] as const) expect(wantsFullMatchCaption(e)).toBe(false)
    })
})

describe('fullMatchCaptionWindows', () => {
    it('should start 1 s after the moment for 5 s on the whole timeline, cut short by the next caption', () => {
        const w = fullMatchCaptionWindows([ev('a', 50, {}), ev('b', 53, { type: 'penalty_missed' }), ev('c', 5, { sourceFileIndex: 1 })], [0, 100])
        expect(w.map((x) => [x.event.id, x.startSec, x.durationSec])).toEqual([['a', 51, 3], ['b', 54, 5], ['c', 106, 5]])
    })
})

describe('fullMatchGraphicsSpec event captions', () => {
    const cutsFm: Cut[] = [{ sourceIndex: 0, startSec: 30, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 50 }]
    const base = { teams, cuts: cutsFm, cumulativeOffsets: [0, 100], cards: false, matchday: 'Cup', windows: [], captions: true }
    const caps = (events: MatchEvent[], extra = {}) => fullMatchGraphicsSpec({ ...base, events, ...extra }).overlays.filter((o) => o.kind === 'caption')
    const R = "Ryan's Rovers"
    const W = 'Walford Town'

    it('should caption a goal with scorer, assist and the score after it, 1 s after for 5 s', () => {
        const [c] = caps([ev('g', 60, { team: R, scorer: 'Sam', assist: 'Jo', notes: 'Top bin' })])
        expect(c).toMatchObject({ kind: 'caption', cutIndex: 0, startSec: 61, durationSec: 5, clock: { offsetSec: 0, rate: 1, totalSec: 5 } })
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'GOAL', person: 'SAM', assist: 'JO', note: 'TOP BIN', stripe: '#f0f0f0' })
        expect(c.kind === 'caption' && c.spec.bug?.text).toBe('1–0')
    })

    it('should label a penalty goal with its taker and no assist', () => {
        const [c] = caps([ev('g', 60, { team: R, scorer: 'Sam', assist: 'Jo', pen: true })])
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'GOAL (PEN)', person: 'SAM' })
        expect(c.kind === 'caption' && c.spec.assist).toBeUndefined()
    })

    it('should credit an own goal to the team it is credited to', () => {
        const [c] = caps([ev('o', 60, { type: 'own_goal', team: W, scorer: 'Ned' })])
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'OWN GOAL', person: 'NED' })
        expect(c.kind === 'caption' && c.spec.bug?.text).toBe('0–1')
    })

    it('should caption a conceded penalty with who conceded it, without changing the score', () => {
        const [c] = caps([ev('p', 60, { type: 'penalty_conceded', team: W, scorer: 'Bo' })])
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'PENALTY CONCEDED', person: 'BO' })
        expect(c.kind === 'caption' && c.spec.bug?.text).toBe('0–0')
    })

    it('should caption a missed penalty with its taker', () => {
        const [c] = caps([ev('m', 60, { type: 'penalty_missed', team: R, scorer: 'Cy' })])
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'PENALTY MISSED', person: 'CY' })
    })

    it('should not caption saves, fouls or highlights', () => {
        expect(caps([ev('s', 60, { type: 'save' }), ev('f', 62, { type: 'foul' }), ev('h', 70, { type: 'highlight', notes: 'x' })])).toEqual([])
    })

    it('should add nothing when captions are off', () => {
        expect(caps([ev('g', 60, { team: R })], { captions: false })).toEqual([])
        expect(caps([ev('g', 60, { team: R })], { captions: undefined })).toEqual([])
    })

    it('should not caption events outside the cuts (before kick-off)', () => {
        expect(caps([ev('g', 10, { team: R })])).toEqual([])
    })

    it('should split a caption across a file join with one continuous clock and no gap', () => {
        const o = caps([ev('g', 97, { team: R })])
        expect(o).toHaveLength(2)
        expect(o[0]).toMatchObject({ cutIndex: 0, startSec: 98, durationSec: 2, toCutEnd: true, clock: { offsetSec: 0, totalSec: 5 } })
        expect(o[1]).toMatchObject({ cutIndex: 1, startSec: 0, durationSec: 3, fromCutStart: true, clock: { offsetSec: 2, rate: 1, totalSec: 5 } })
    })

    it('should cut a caption short when the next one begins', () => {
        const o = caps([ev('a', 60, { team: R }), ev('b', 63, { type: 'penalty_missed', team: W })])
        expect(o.map((x) => [x.startSec, x.durationSec])).toEqual([[61, 3], [64, 5]])
        expect(o[0].kind === 'caption' && o[0].clock.totalSec).toBe(3)
    })

    it('should replace the score bug where a caption overlaps it', () => {
        const windows = [{ startSec: 60, durationSec: 10, score: [1, 0] as [number, number] }]
        const spec = fullMatchGraphicsSpec({ ...base, events: [ev('g', 60, { team: R })], windows })
        const bugs = spec.overlays.filter((o) => o.kind === 'scoreBug').map((o) => [o.startSec, o.durationSec])
        expect(bugs).toEqual([[60, 1], [66, 4]])
        expect(spec.overlays.filter((o) => o.kind === 'caption')).toHaveLength(1)
    })

    it('should leave score bug windows alone when captions are off', () => {
        const windows = [{ startSec: 60, durationSec: 10, score: [1, 0] as [number, number] }]
        const spec = fullMatchGraphicsSpec({ ...base, captions: false, events: [ev('g', 60, { team: R })], windows })
        expect(spec.overlays.map((o) => [o.kind, o.startSec, o.durationSec])).toEqual([['scoreBug', 60, 10]])
    })
})
