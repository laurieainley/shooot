import { describe, it, expect } from 'vitest'
import { buildGraphicsSpec, teaserCaptionSpec, normaliseGraphics, scorerColumns, TALLY_GOALS_OVER, fullMatchCaptionWindows, fullMatchGraphicsSpec, wantsFullMatchCaption, wantsLowerThird, type GraphicsSettings } from './plan'
import { captionWord } from './themes/shooot'
import { classicTheme } from './themes/classic'
import { getTheme, isThemeId, THEMES } from './themes'
import type { MatchEvent, Team } from '../types'
import type { Cut } from '../render/types'

const teams: Team[] = [
    { name: "Ryan's Rovers", color: '#f0f0f0', roster: [] },
    { name: 'Walford Town', color: '#ec5fa4', roster: [], initials: 'WT' },
]
const ALL: GraphicsSettings = { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' }
const ev = (id: string, t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })
const cuts: Cut[] = [
    { sourceIndex: 0, startSec: 10, endSec: 24 },
    { sourceIndex: 0, startSec: 16, endSec: 21, speed: 0.5, gain: 0.5 },
    { sourceIndex: 0, startSec: 50, endSec: 64 },
]
const build = (events: MatchEvent[], settings = ALL, c = cuts) =>
    buildGraphicsSpec({ events, teams, cuts: c, cumulativeOffsets: [0], settings, matchday: 'Matchday 3' })

describe('opening card line-ups', () => {
    const rostered: Team[] = [{ ...teams[0], roster: ['  sam taylor ', 'jo', ''] }, { ...teams[1], roster: [] }]
    const make = (t: Team[]) => buildGraphicsSpec({ events: [ev('a', 12, { team: t[0].name })], teams: t, cuts, cumulativeOffsets: [0], settings: ALL, matchday: 'M' })

    it('should add the upper-cased roster to the intro badges only', () => {
        const spec = make(rostered)
        expect(spec.intro?.left.roster).toEqual(['SAM TAYLOR', 'JO'])
        expect(spec.intro?.right.roster).toBeUndefined()
        expect(spec.outro?.left.roster).toBeUndefined()
    })

    it('should leave the intro unchanged for teams without rosters', () => {
        expect(make(teams).intro).toEqual({ heading: 'M', centre: 'VS', left: expect.not.objectContaining({ roster: expect.anything() }), right: expect.not.objectContaining({ roster: expect.anything() }) })
    })
})

describe('wantsLowerThird', () => {
    it('should cover goals, own goals, penalties and every highlight', () => {
        expect(wantsLowerThird({ type: 'goal' })).toBe(true)
        expect(wantsLowerThird({ type: 'goal', pen: true })).toBe(true)
        expect(wantsLowerThird({ type: 'own_goal' })).toBe(true)
        expect(wantsLowerThird({ type: 'penalty_missed' })).toBe(true)
        expect(wantsLowerThird({ type: 'penalty_conceded' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight', notes: 'Nutmeg' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight' })).toBe(true)
        expect(wantsLowerThird({ type: 'highlight', notes: '  ' })).toBe(true)
    })

    it('should caption saves and fouls', () => {
        expect(wantsLowerThird({ type: 'save' })).toBe(true)
        expect(wantsLowerThird({ type: 'foul', notes: 'late' })).toBe(true)
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
            expect.objectContaining({ kind: 'caption', cutIndex: 0, startSec: 21, durationSec: 3, toCutEnd: true, clock: { offsetSec: 0, rate: 1, totalSec: 5 }, spec: { label: 'GOAL!', tone: 'goal', person: 'SAM', stripe: '#f0f0f0', bug: bug('1–0') } }),
            expect.objectContaining({ kind: 'caption', cutIndex: 1, startSec: 16, durationSec: 1, clock: { offsetSec: 3, rate: 2, totalSec: 5 }, fromCutStart: true }),
            expect.objectContaining({ kind: 'caption', cutIndex: 2, startSec: 56, durationSec: 5, spec: expect.objectContaining({ label: 'PEN GOAL', person: 'ALEX', stripe: '#ec5fa4', bug: bug('1–1') }) }),
        ])
    })

    it('should carry a goal note on the caption', () => {
        const spec = build([ev('a', 20, { team: 'Walford Town', scorer: 'Sam', notes: 'top corner' })])
        expect(spec.overlays[0]).toMatchObject({ spec: { label: 'GOAL!', person: 'SAM', note: 'TOP CORNER' } })
    })

    it('should keep a long note whole on the caption (no cut at 60)', () => {
        const note = 'Laurie waits patiently for Harry to do his laces (foreshadowing)'
        const spec = build([ev('a', 20, { team: 'Walford Town', scorer: 'Sam', notes: note })])
        expect(spec.overlays[0]).toMatchObject({ spec: { note: note.toUpperCase() } })
    })

    it('should keep an old 150-character note whole on the caption (wrapNote decides where any "…" goes)', () => {
        const note = 'word '.repeat(30).trim()
        expect(note.length).toBe(149)
        const spec = build([ev('a', 20, { team: 'Walford Town', scorer: 'Sam', notes: note })])
        expect(spec.overlays[0]).toMatchObject({ spec: { note: note.toUpperCase() } })
    })

    it('should credit an own goal to the team it counts for', () => {
        const spec = build([ev('a', 20, { type: 'own_goal', team: 'Walford Town', scorer: 'Smith' })])
        expect(spec.overlays[0]).toMatchObject({ spec: { label: 'GOAL!', tone: 'ownGoal', person: 'SMITH', stripe: '#ec5fa4', bug: { text: '0–1' } } })
    })

    it('should show the current score on a highlight caption, and use muted grey without a team', () => {
        const spec = build([ev('g', 20, { team: 'Walford Town' }), ev('h', 52, { type: 'highlight', scorer: 'Jo', notes: 'nutmeg on the wing' })], { ...ALL })
        expect(spec.overlays.at(-1)).toMatchObject({ cutIndex: 2, startSec: 50, spec: { label: 'HIGHLIGHT', person: 'JO', note: 'NUTMEG ON THE WING', stripe: '#8E9A92', bug: { text: '0–1' } } })
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
        expect(build([ev('a', 20, { unlinked: true }), ev('k', 22, { type: 'kick_off' })]).overlays).toEqual([])
    })

    it('should never put a caption on a slowed replay', () => {
        const spec = build([ev('a', 18, {})], ALL, [cuts[1], cuts[0]])
        expect(spec.overlays[0]).toMatchObject({ cutIndex: 1 })
    })

    it('should tag replays when asked', () => {
        const spec = build([], { cards: false, lowerThirds: false, replayTag: true, theme: 'shooot' })
        expect(spec.overlays).toEqual([expect.objectContaining({ kind: 'replayTag', cutIndex: 1, startSec: 16, durationSec: 5, speed: 0.5 })])
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

    it('should keep windows on the match cuts around an inserted replay, which only gets its tag', () => {
        const replayCuts: Cut[] = [
            { sourceIndex: 0, startSec: 30, endSec: 96 },
            { sourceIndex: 0, startSec: 92, endSec: 96, speed: 0.5, gain: 0.5 },
            { sourceIndex: 0, startSec: 96, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 50 },
        ]
        const spec = fullMatchGraphicsSpec({ ...args, cuts: replayCuts, replayTag: true })
        const bugs = spec.overlays.filter((o) => o.kind === 'scoreBug').map((o) => [o.cutIndex, o.startSec, o.durationSec])
        expect(bugs).toEqual([[0, 30, 8], [0, 95, 1], [2, 96, 4], [3, 0, 5]])
        expect(spec.overlays.filter((o) => o.cutIndex === 1).map((o) => o.kind)).toEqual(['replayTag'])
        expect(fullMatchGraphicsSpec({ ...args, cuts: replayCuts }).overlays.some((o) => o.kind === 'replayTag')).toBe(false)
    })

    it('should add VS and full-time cards only when asked', () => {
        expect(fullMatchGraphicsSpec(args).intro).toMatchObject({ heading: 'CUP', centre: 'VS' })
        expect(fullMatchGraphicsSpec(args).outro).toMatchObject({ heading: 'FULL TIME', centre: '1 - 0' })
        expect(fullMatchGraphicsSpec({ ...args, cards: false }).intro).toBeUndefined()
    })
})

describe('wantsFullMatchCaption', () => {
    it('should cover goals, penalties, own goals, conceded and missed penalties and saves only', () => {
        for (const e of [{ type: 'goal' }, { type: 'goal', pen: true }, { type: 'own_goal' }, { type: 'penalty_conceded' }, { type: 'penalty_missed' }, { type: 'save' }, { type: 'foul' }] as const) expect(wantsFullMatchCaption(e)).toBe(true)
        for (const e of [{ type: 'highlight', notes: 'x' }, { type: 'kick_off' }] as const) expect(wantsFullMatchCaption(e)).toBe(false)
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
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'GOAL!', person: 'SAM', assist: 'JO', note: 'TOP BIN', stripe: '#f0f0f0' })
        expect(c.kind === 'caption' && c.spec.bug?.text).toBe('1–0')
    })

    it('should label a penalty goal with its taker and no assist', () => {
        const [c] = caps([ev('g', 60, { team: R, scorer: 'Sam', assist: 'Jo', pen: true })])
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'PEN GOAL', person: 'SAM' })
        expect(c.kind === 'caption' && c.spec.assist).toBeUndefined()
    })

    it('should credit an own goal to the team it is credited to', () => {
        const [c] = caps([ev('o', 60, { type: 'own_goal', team: W, scorer: 'Ned' })])
        expect(c.kind === 'caption' && c.spec).toMatchObject({ label: 'GOAL!', tone: 'ownGoal', person: 'NED' })
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

    it('should caption saves and fouls, not highlights', () => {
        expect(caps([ev('s', 60, { type: 'save', scorer: 'Kim' }), ev('f', 90, { type: 'foul' })]).map((c) => c.kind === 'caption' && c.spec.label)).toEqual(['SAVE', 'FOUL'])
        expect(caps([ev('h', 70, { type: 'highlight', notes: 'x' })])).toEqual([])
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

describe('captionWord', () => {
    it('should use the brand words for each event', () => {
        expect(captionWord({ type: 'goal' })).toBe('GOAL!')
        expect(captionWord({ type: 'goal', pen: true })).toBe('PEN GOAL')
        expect(captionWord({ type: 'own_goal' })).toBe('OWN GOAL')
        expect(captionWord({ type: 'penalty_missed' })).toBe('PENALTY MISSED')
        expect(captionWord({ type: 'save' })).toBe('SAVE')
        expect(captionWord({ type: 'highlight' })).toBe('HIGHLIGHT')
    })

    it('should say GOAL! for an own goal in the Shooot look (the OG chip marks it), OWN GOAL where there is no chip', () => {
        const og = { type: 'own_goal' as const }
        expect(getTheme('shooot').caption.word(og)).toBe('GOAL!')
        expect(getTheme('shooot').caption.tone?.(og)).toBe('ownGoal')
        expect(getTheme('tnf').caption.word(og)).toBe('OWN GOAL')
    })
})

describe('caption minute and tone', () => {
    const kick = ev('k', 10, { type: 'kick_off' })

    it('should show the match minute once kick-off is marked (kick-off is minute 1)', () => {
        const spec = build([kick, ev('a', 20, { team: "Ryan's Rovers", scorer: 'Sam' }), ev('b', 55, { team: 'Walford Town', scorer: 'Alex' })])
        const specs = spec.overlays.filter((o) => o.kind === 'caption').map((o) => o.kind === 'caption' && o.spec.minute)
        expect(new Set(specs)).toEqual(new Set(["1'"]))
        const late = build([kick, ev('a', 10 + 61 * 60, { team: "Ryan's Rovers", scorer: 'Sam' })], ALL, [{ sourceIndex: 0, startSec: 3600, endSec: 3900 }])
        expect(late.overlays[0].kind === 'caption' && late.overlays[0].spec.minute).toBe("62'")
    })

    it('should leave the minute out without a kick-off', () => {
        const cap = build([ev('a', 20, { team: "Ryan's Rovers" })]).overlays[0]
        expect(cap.kind === 'caption' && cap.spec.minute).toBeUndefined()
    })

    it('should tone goals lime, own goals chalk and the rest dark', () => {
        const tone = (e: Partial<MatchEvent>) => {
            const c = build([ev('x', 20, { team: "Ryan's Rovers", ...e })]).overlays[0]
            return c.kind === 'caption' ? c.spec.tone : undefined
        }
        expect(tone({})).toBe('goal')
        expect(tone({ pen: true })).toBe('goal')
        expect(tone({ type: 'own_goal' })).toBe('ownGoal')
        expect(tone({ type: 'penalty_missed' })).toBe('other')
    })
})

describe('scorerColumns', () => {
    const R = "Ryan's Rovers"
    const W = 'Walford Town'

    it('should list scorers per team with minutes, pens marked, in order of first goal', () => {
        const events = [
            ev('k', 0, { type: 'kick_off' }),
            ev('a', 12 * 60, { team: R, scorer: 'Sam Taylor' }),
            ev('b', 20 * 60, { team: W, scorer: 'Alex' }),
            ev('c', 43 * 60 + 5, { team: R, scorer: 'sam taylor', pen: true }),
            ev('d', 50 * 60, { team: R }),
        ]
        expect(scorerColumns(events, teams, [0])).toEqual({
            left: [{ name: 'SAM TAYLOR', minutes: "13' 44' PEN" }],
            right: [{ name: 'ALEX', minutes: "21'" }],
        })
    })

    it('should put an own goal under the credited team, marked OG', () => {
        const cols = scorerColumns([ev('o', 60, { type: 'own_goal', team: W, scorer: 'Smith' })], teams, [0])
        expect(cols.right).toEqual([{ name: 'SMITH (OG)', minutes: "2'" }])
        expect(cols.left).toEqual([])
    })

    describe('table (more than TALLY_GOALS_OVER goals)', () => {
        let n = 0
        const goal = (team: string, scorer?: string, extra: Partial<MatchEvent> = {}): MatchEvent => ev(`t${n++}`, 60 * n, { team, scorer, ...extra })
        /** Filler goals for the right team so the match has `total` goals in all. */
        const pad = (total: number, have: number): MatchEvent[] => Array.from({ length: total - have }, () => goal(W))
        const stats = (l: { stats?: { goals: number; assists: number; og: number } }): number[] => [l.stats!.goals, l.stats!.assists, l.stats!.og]
        const withRosters: Team[] = [{ ...teams[0], roster: ['Dan', 'Jo', 'Pat', 'Sam'] }, { ...teams[1], roster: ['Smith', 'Lee'] }]

        it('should keep the minute list at 7 goals and switch to the table at 8', () => {
            expect(TALLY_GOALS_OVER).toBe(7)
            const seven = [goal(R, 'Dan'), ...pad(7, 1)]
            expect(scorerColumns(seven, teams, [0]).left).toEqual([{ name: 'DAN', minutes: "2'" }])
            const eight = [goal(R, 'Dan'), ...pad(8, 1)]
            expect(scorerColumns(eight, teams, [0]).left).toEqual([{ name: 'DAN', minutes: '', stats: { goals: 1, assists: 0, og: 0 } }])
        })

        it('should count goals, assists and own goals per player, per team', () => {
            const events = [
                ...Array.from({ length: 5 }, () => goal(R, 'Dan', { assist: 'Sam' })),
                goal(R, 'Dan'), goal(R, 'Dan'), goal(R, 'Dan'),
                goal(R, 'Jo', { assist: 'Dan' }), goal(R, 'Pat', { assist: 'Dan' }),
                ...pad(11, 10),
            ]
            const left = scorerColumns(events, teams, [0]).left
            expect(left.map((l) => [l.name, ...stats(l)])).toEqual([['DAN', 8, 2, 0], ['JO', 1, 0, 0], ['PAT', 1, 0, 0], ['SAM', 0, 5, 0]])
        })

        it('should sort by goals, then assists, then fewest own goals, then first involvement, assist-only and OG-only rows included', () => {
            const events = [
                goal(R, 'Early'), goal(R, 'Late', { assist: 'X' }), goal(R, 'Mid', { assist: 'X' }),
                goal(R, 'Two'), goal(R, 'Two'), goal(R, 'Early'),
                goal(R, 'Two', { assist: 'Y' }),
                goal(W, 'Smith', { type: 'own_goal' }),
                ...pad(13, 8),
            ]
            const cols = scorerColumns(events, withRosters, [0])
            expect(cols.left.map((l) => l.name)).toEqual(['TWO', 'EARLY', 'LATE', 'MID', 'X', 'Y'])
            expect(cols.left.find((l) => l.name === 'X')).toMatchObject({ stats: { goals: 0, assists: 2, og: 0 } })
            // fewer own goals first among equals
            const og = [goal(W, 'Lee', { type: 'own_goal' }), goal(W, 'Smith', { type: 'own_goal' }), goal(W, 'Smith', { type: 'own_goal' }), goal(W, 'Lee', { type: 'own_goal' }), goal(W, 'Smith', { type: 'own_goal' }), ...pad(9, 5)]
            expect(scorerColumns(og, withRosters, [0]).right.slice(0, 2).map((l) => [l.name, ...stats(l)])).toEqual([['LEE', 0, 0, 2], ['SMITH', 0, 0, 3]])
        })

        it('should put an own goal in the table of the scorer\'s own team, not the credited one', () => {
            // credited to Walford, scored by Ryan's Rovers player Dan (the usual case)
            const events = [goal(W, 'Dan', { type: 'own_goal' }), ...pad(8, 1)]
            const cols = scorerColumns(events, withRosters, [0])
            expect(cols.left).toEqual([{ name: 'DAN', minutes: '', stats: { goals: 0, assists: 0, og: 1 } }])
            expect(cols.right.some((l) => l.name === 'DAN')).toBe(false)
            // credited to Walford, scorer named from Walford's own roster: his own team's table
            const either = [goal(W, 'Smith', { type: 'own_goal' }), ...pad(8, 1)]
            expect(scorerColumns(either, withRosters, [0]).right.find((l) => l.name === 'SMITH')).toMatchObject({ stats: { goals: 0, assists: 0, og: 1 } })
            expect(scorerColumns(either, withRosters, [0]).left).toEqual([])
        })

        it('should put an own goal by an unknown player under the team opposite the credited one', () => {
            const events = [goal(W, 'Stranger', { type: 'own_goal' }), goal(R, 'Nobody', { type: 'own_goal' }), ...pad(8, 2)]
            const cols = scorerColumns(events, withRosters, [0])
            expect(cols.left.map((l) => l.name)).toEqual(['STRANGER'])
            expect(cols.right.map((l) => l.name)).toEqual(['NOBODY'])
            // the same name on both rosters is ambiguous too
            const both: Team[] = [{ ...teams[0], roster: ['Alex'] }, { ...teams[1], roster: ['alex'] }]
            expect(scorerColumns([goal(W, 'Alex', { type: 'own_goal' }), ...pad(8, 1)], both, [0]).left.map((l) => l.name)).toEqual(['ALEX'])
        })

        it('should merge a player\'s goals, assists and own goal into one row of their team', () => {
            const events = [goal(R, 'Dan', { assist: 'Jo' }), goal(R, 'Jo', { assist: 'Dan' }), goal(W, 'Dan', { type: 'own_goal' }), ...pad(8, 3)]
            expect(scorerColumns(events, withRosters, [0]).left.map((l) => [l.name, ...stats(l)])).toEqual([['JO', 1, 1, 0], ['DAN', 1, 1, 1]])
        })

        it('should count penalties as goals, ignore their assist, and keep nameless goals in the total only', () => {
            const events = [goal(R, 'Dan', { pen: true, assist: 'Sam' }), goal(R, 'Dan'), goal(R), ...pad(8, 3)]
            expect(scorerColumns(events, teams, [0]).left).toEqual([{ name: 'DAN', minutes: '', stats: { goals: 2, assists: 0, og: 0 } }])
        })

        it('should invalidate the full-time card cache key when the table changes', () => {
            const a = build([goal(R, 'Dan'), ...pad(8, 1)]).outro
            const b = build([goal(R, 'Dan'), goal(R, 'Dan'), ...pad(9, 2)]).outro
            expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b))
            const c = build([goal(R, 'Dan', { assist: 'Jo' }), ...pad(8, 1)]).outro
            expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c))
        })
    })

    it('should put the scorers on the full-time card only, and only when someone is named', () => {
        const spec = build([ev('a', 20, { team: R, scorer: 'Sam' })])
        expect(spec.outro?.scorers?.left).toEqual([{ name: 'SAM', minutes: "1'" }])
        expect(spec.intro?.scorers).toBeUndefined()
        expect(build([ev('a', 20, { team: R })]).outro?.scorers).toBeUndefined()
    })
})

describe('themes', () => {
    const R = "Ryan's Rovers"
    const classic: GraphicsSettings = { ...ALL, theme: 'classic' }

    it('should look themes up by id and fall back to Shooot for anything unknown', () => {
        expect(getTheme('classic').id).toBe('classic')
        expect(getTheme('shooot').id).toBe('shooot')
        expect(getTheme('neon').id).toBe('shooot')
        expect(getTheme(undefined).id).toBe('shooot')
        expect(isThemeId('classic')).toBe(true)
        expect(isThemeId('neon')).toBe(false)
        expect(THEMES.map((t) => t.id)).toEqual(['shooot', 'classic', 'tnf'])
        expect(isThemeId('tnf')).toBe(true)
    })

    it('should ship each theme with its own fonts: Bebas Neue only in Classic', () => {
        expect(getTheme('classic').fonts.map((f) => f.family)).toEqual(['Bebas Neue', 'Bebas Neue'])
        expect(getTheme('shooot').fonts.map((f) => f.family).sort()).toEqual(['Shooot Heading', 'Shooot Mono', 'Shooot Scoreboard', 'Shooot Shirt', 'Shooot Stadium'])
    })

    it('should stamp the selected theme on the spec, normalising unknown values to Shooot', () => {
        expect(build([ev('a', 20, {})], classic).theme).toBe('classic')
        expect(build([ev('a', 20, {})]).theme).toBe('shooot')
        expect(build([ev('a', 20, {})], { ...ALL, theme: 'neon' as never }).theme).toBe('shooot')
        expect(normaliseGraphics({ theme: 'classic' }, ALL).theme).toBe('classic')
        expect(normaliseGraphics({ theme: 'neon' }, ALL).theme).toBe('shooot')
        expect(normaliseGraphics({}, { ...ALL, theme: 'classic' }).theme).toBe('classic')
        expect(fullMatchGraphicsSpec({ events: [], teams, cuts, cumulativeOffsets: [0], cards: false, matchday: '', windows: [], theme: 'classic' }).theme).toBe('classic')
    })

    it('should word captions the classic way (GOAL (PEN), no tone, no minute, orange without a team) and add no scorer columns', () => {
        const spec = build([ev('k', 5, { type: 'kick_off' }), ev('a', 20, { team: R, scorer: 'Sam', pen: true }), ev('h', 52, { type: 'highlight' })], classic)
        const caps = spec.overlays.filter((o) => o.kind === 'caption').map((o) => (o.kind === 'caption' ? o.spec : null))
        expect(caps[0]).toEqual({ label: 'GOAL (PEN)', person: 'SAM', stripe: '#f0f0f0', bug: expect.anything() })
        expect(caps.at(-1)).toMatchObject({ label: 'HIGHLIGHT', stripe: classicTheme.caption.defaultStripe })
        expect(spec.outro?.scorers).toBeUndefined()
    })
})

describe('buildGraphicsSpec clip options', () => {
    const events = [ev('A', 100, { team: "Ryan's Rovers" }), ev('B', 105, { team: 'Walford Town' })]
    const clipCuts: Cut[] = [{ sourceIndex: 0, startSec: 90, endSec: 115 }]
    const run = (extra: Partial<Parameters<typeof buildGraphicsSpec>[0]>, settings = ALL) =>
        buildGraphicsSpec({ events, teams, cuts: clipCuts, cumulativeOffsets: [0], settings, matchday: 'M', ...extra })
    type Cap = Extract<ReturnType<typeof run>['overlays'][number], { kind: 'caption' }>
    const caps = (extra: Partial<Parameters<typeof buildGraphicsSpec>[0]>, settings = ALL): Cap[] =>
        run(extra, settings).overlays.filter((o): o is Cap => o.kind === 'caption')

    it('should caption only the chosen event but score it from all events', () => {
        const captions = caps({ captionEvents: new Set(['B']) })
        expect(captions).toHaveLength(1)
        expect(captions[0].label).toContain('Caption')
        expect(captions[0].spec.bug?.text).toBe('1–1')
    })
    it('should leave the score out when captionScore is false', () => {
        const captions = caps({ captionScore: false })
        expect(captions.length).toBeGreaterThan(0)
        expect(captions.every((o) => !o.spec.bug)).toBe(true)
    })
    it('should skip cards when cards is false', () => {
        const spec = run({ cards: false })
        expect(spec.intro).toBeUndefined()
        expect(spec.outro).toBeUndefined()
    })
})

describe('teaserCaptionSpec', () => {
    const t = (e: MatchEvent) => teaserCaptionSpec(e, teams, getTheme('shooot'))
    it('should say COMING UP in the goal tone with the event word and name', () => {
        const s = t(ev('a', 10, { scorer: 'Dan', team: 'Walford Town', notes: 'makes it 3-2', assist: 'Bo' }))
        expect(s).toEqual({ label: 'COMING UP...', tone: 'goal', note: 'GOAL · DAN', stripe: getTheme('shooot').caption.defaultStripe })
    })
    it('should name penalties and the event word alone', () => {
        expect(t(ev('a', 10, { scorer: 'Dan', pen: true })).note).toBe('PEN GOAL · DAN')
        expect(t(ev('a', 10, { type: 'penalty_conceded', scorer: 'A Lo' })).note).toBe('PENALTY CONCEDED · A LO')
        expect(t(ev('a', 10, { type: 'save' })).note).toBe('SAVE')
    })
    it('should give a highlight its note, else its name, else HIGHLIGHT', () => {
        expect(t(ev('a', 10, { type: 'highlight', notes: 'Nutmeg on the wing', scorer: 'Sam' })).note).toBe('NUTMEG ON THE WING')
        expect(t(ev('a', 10, { type: 'highlight', scorer: 'Sam' })).note).toBe('SAM')
        expect(t(ev('a', 10, { type: 'highlight' })).note).toBe('HIGHLIGHT')
    })
    it('should use the moment\'s own caption, uppercased, in place of the automatic line', () => {
        expect(t(ev('a', 10, { scorer: 'Dan', teaser: { caption: 'Wait for the finish' } })).note).toBe('WAIT FOR THE FINISH')
        expect(t(ev('a', 10, { type: 'highlight', notes: 'nutmeg', teaser: { caption: 'Skills' } })).note).toBe('SKILLS')
        expect(t(ev('a', 10, { scorer: 'Dan', teaser: { caption: '   ' } })).note).toBe('GOAL · DAN')
        const long = 'x'.repeat(100)
        expect(t(ev('a', 10, { teaser: { caption: long } })).note).toBe(long.toUpperCase())
    })
})

describe('teaser graphics', () => {
    const star = { marks: ['teaser' as const] }
    const tcuts: Cut[] = [
        { sourceIndex: 0, startSec: 30, endSec: 44 },
        { sourceIndex: 0, startSec: 30, endSec: 44 },
        { sourceIndex: 0, startSec: 36, endSec: 41, speed: 0.5, gain: 0.5 },
    ]
    const events = [ev('g', 40, { scorer: 'Dan', team: 'Walford Town', notes: 'late winner', ...star })]
    const run = (c: Cut[], n: number, settings = { ...ALL, replayTag: true }, evs = events) =>
        buildGraphicsSpec({ events: evs, teams, cuts: c, cumulativeOffsets: [0], settings, matchday: 'M', teaserCount: n, teaserClips: Array(n).fill(0) })

    it('should banner the whole teaser clip and keep reel captions and replay tags off teaser cuts', () => {
        const spec = run(tcuts, 1)
        const caps = spec.overlays.filter((o) => o.kind === 'caption')
        const teaser = caps.filter((o) => o.cutIndex === 0)
        expect(teaser).toHaveLength(1)
        expect(teaser[0]).toMatchObject({ startSec: 30, durationSec: 14, spec: { label: 'COMING UP...', note: 'GOAL · DAN' }, clock: { offsetSec: 0, rate: 1, totalSec: 14 } })
        const reel = caps.filter((o) => o.kind === 'caption' && o.cutIndex !== 0)
        expect(reel.map((o) => o.cutIndex)).toEqual([1, 2])
        expect(spec.overlays.filter((o) => o.kind === 'replayTag').map((o) => o.cutIndex)).toEqual([2])
        for (const o of teaser) expect(o.kind === 'caption' && o.spec).not.toHaveProperty('bug')
    })
    it('should span one clock across a teaser clip split over two files', () => {
        const split: Cut[] = [{ sourceIndex: 0, startSec: 92, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 6 }]
        const spec = buildGraphicsSpec({ events: [ev('a', 2, { sourceFileIndex: 1, scorer: 'Dan', ...star })], teams, cuts: split, cumulativeOffsets: [0, 100], settings: ALL, matchday: 'M', teaserCount: 2, teaserClips: [0, 0] })
        const caps = spec.overlays.filter((o) => o.kind === 'caption')
        expect(caps).toMatchObject([
            { cutIndex: 0, startSec: 92, durationSec: 8, toCutEnd: true, clock: { offsetSec: 0, totalSec: 14 } },
            { cutIndex: 1, startSec: 0, durationSec: 6, fromCutStart: true, clock: { offsetSec: 8, totalSec: 14 } },
        ])
    })
    it('should keep two starred clips separate when the second starts exactly at 0 in the next file', () => {
        // Clip A ends at the end of file 0; clip B is an event exactly `before` s into file 1 (window 0..6): same cuts as a split clip.
        const cutsAB: Cut[] = [{ sourceIndex: 0, startSec: 92, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 6 }]
        const evs = [ev('a', 98, { scorer: 'Dan', ...star }), ev('b', 2, { sourceFileIndex: 1, scorer: 'Sam', ...star })]
        const spec = buildGraphicsSpec({ events: evs, teams, cuts: cutsAB, cumulativeOffsets: [0, 100], settings: ALL, matchday: 'M', teaserCount: 2, teaserClips: [0, 1] })
        const caps = spec.overlays.filter((o) => o.kind === 'caption')
        expect(caps).toMatchObject([
            { cutIndex: 0, startSec: 92, durationSec: 8, clock: { offsetSec: 0, totalSec: 8 } },
            { cutIndex: 1, startSec: 0, durationSec: 6, clock: { offsetSec: 0, totalSec: 6 } },
        ])
        expect(caps.some((o) => o.kind === 'caption' && (o.fromCutStart || o.toCutEnd))).toBe(false)
    })
    it('should banner only the normal-speed teaser clip and REPLAY-tag its teaser replay', () => {
        const withReplay: Cut[] = [
            { sourceIndex: 0, startSec: 30, endSec: 44 },
            { sourceIndex: 0, startSec: 36, endSec: 41, speed: 0.5, gain: 0.5 },
            { sourceIndex: 0, startSec: 30, endSec: 44 },
            { sourceIndex: 0, startSec: 36, endSec: 41, speed: 0.5, gain: 0.5 },
        ]
        const spec = buildGraphicsSpec({ events, teams, cuts: withReplay, cumulativeOffsets: [0], settings: { ...ALL, replayTag: true }, matchday: 'M', teaserCount: 2, teaserClips: [0, 0] })
        const caps = spec.overlays.filter((o) => o.kind === 'caption')
        const coming = caps.filter((o) => o.kind === 'caption' && o.spec.label === 'COMING UP...')
        expect(coming).toHaveLength(1)
        expect(coming[0]).toMatchObject({ cutIndex: 0, startSec: 30, durationSec: 14, clock: { offsetSec: 0, totalSec: 14 } })
        expect(coming[0]).not.toHaveProperty('toCutEnd')
        expect(caps.some((o) => o.cutIndex === 1)).toBe(false)
        expect(caps.filter((o) => o.cutIndex >= 2).map((o) => o.cutIndex)).toEqual([2, 3])
        expect(spec.overlays.filter((o) => o.kind === 'replayTag').map((o) => o.cutIndex)).toEqual([1, 3])
        expect(spec.introAfterCut).toBe(2)
    })
    it('should banner each teaser clip with its own moment only, even when another starred moment falls inside it', () => {
        const two = [ev('a', 40, { scorer: 'Dan', ...star }), ev('b', 43, { type: 'save', ...star })]
        const clips: Cut[] = [{ sourceIndex: 0, startSec: 30, endSec: 44 }, { sourceIndex: 0, startSec: 33, endSec: 47 }]
        const spec = buildGraphicsSpec({ events: two, teams, cuts: clips, cumulativeOffsets: [0], settings: ALL, matchday: 'M', teaserCount: 2, teaserClips: [0, 1] })
        const caps = spec.overlays.filter((o) => o.kind === 'caption')
        expect(caps.map((o) => o.kind === 'caption' && [o.cutIndex, o.spec.note, o.startSec, o.durationSec])).toEqual([[0, 'GOAL · DAN', 30, 14], [1, 'SAVE', 33, 14]])
    })
    it('should banner the moment\'s own caption', () => {
        const evs = [ev('g', 40, { scorer: 'Dan', ...star, teaser: { caption: 'Top bins' } })]
        const caps = run(tcuts, 1, ALL, evs).overlays.filter((o) => o.kind === 'caption' && o.cutIndex === 0)
        expect(caps.map((o) => o.kind === 'caption' && o.spec.note)).toEqual(['TOP BINS'])
    })
    it('should place the intro after the teaser only when cards are on', () => {
        expect(run(tcuts, 1).introAfterCut).toBe(1)
        expect(run(tcuts, 1, { ...ALL, cards: false })).not.toHaveProperty('introAfterCut')
        expect(run(tcuts, 0)).not.toHaveProperty('introAfterCut')
    })
})
