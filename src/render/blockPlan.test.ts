// Plan level: real full-match and highlights plans, split into blocks and keyed, to check that an edit only changes the keys of the blocks it touches.
import { describe, expect, it } from 'vitest'
import { fullMatchExport, highlightsExport, planOutput, type ExportPlan, type ExportState } from '../utils/exportPlans'
import type { MatchEvent, VideoSourceFile } from '../types'
import { buildReuseKeys } from './unitCache'
import { gridBlockFrames, gridSegments, keyEvery, outputFrameSec, segmentSpan } from './transcodePlan'

const FS = outputFrameSec(29.97)
const N = gridBlockFrames(FS, keyEvery(FS, 2), null)
const file = (name: string, duration: number): VideoSourceFile => ({ id: name, name, url: '', file: new File([new Uint8Array(10)], name, { lastModified: 7 }), durationSec: duration, kind: 'full' })
const ev = (id: string, type: MatchEvent['type'], sec: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, type, matchTimeSec: sec, sourceFileIndex: 0, ...extra })
const goal = (id: string, sec: number, scorer = 'Sam'): MatchEvent => ev(id, 'goal', sec, { team: 'Whites', scorer })
const baseEvents = [ev('k', 'kick_off', 120), goal('g1', 900), goal('g2', 2400), ev('w', 'final_whistle', 3500)]
const state = (events: MatchEvent[], fm: Partial<ExportState['fullMatch']> = {}): ExportState => ({
    files: [file('GX010001.MP4', 4000)], events, cumulativeOffsets: [0],
    lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
    graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot' },
    teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
    matchdayLabel: null, fullMatch: { cards: true, scoreBug: 'goals', intervalMin: 5, captions: false, replays: false, quality: '4k', ...fm },
    highlightsTeaser: false,
})

/** Key of every unit of a plan, as `source:firstFrameNumber:frames` -> key (blocks) or `replay:cut:n` (timed pieces). */
function unitKeys(plan: ExportPlan): Map<string, string> {
    const rk = buildReuseKeys({ which: plan.kind === 'highlights' ? 'highlights' : 'fullMatch', cuts: plan.cuts, sources: plan.sources, spec: plan.spec, quality: '4k', videoBitrate: 20e6, logo: 'default' })
    const out = new Map<string, string>()
    for (const sg of gridSegments(plan.cuts, FS, N, Math.round(120 / FS))) {
        const c = plan.cuts[sg.cutIndex]
        const { a, b } = segmentSpan(c, sg, FS)
        out.set(sg.grid !== undefined ? `${c.sourceIndex}:${sg.grid}:${sg.frames}` : `timed:${sg.cutIndex}:${sg.firstFrame}`, sg.grid !== undefined ? rk.block(sg.cutIndex, a, b) : rk.cut(sg.cutIndex, a, b))
    }
    return out
}
/** Keys that are in both with the same unit id, over keys in either. */
const same = (a: Map<string, string>, b: Map<string, string>): { kept: number; changed: string[]; added: string[] } => {
    const changed = [...a].filter(([k, v]) => b.has(k) && b.get(k) !== v).map(([k]) => k)
    return { kept: [...a].filter(([k, v]) => b.get(k) === v).length, changed, added: [...b.keys()].filter((k) => !a.has(k)) }
}
const plan = (events: MatchEvent[], fm: Partial<ExportState['fullMatch']> = {}, q = planOutput('4k')): ExportPlan => fullMatchExport(state(events, fm), 'full', q)

describe('full match blocks', () => {
    it('should be hundreds of 10 s blocks for a whole match', () => {
        const keys = unitKeys(plan(baseEvents))
        expect(keys.size).toBeGreaterThan(300)
        expect(N * FS).toBeGreaterThan(9.9)
        expect(N * FS).toBeLessThan(10.1)
    })
    it('should leave every interior block alone when kick-off or the final whistle moves', () => {
        const a = unitKeys(plan(baseEvents))
        const moved = unitKeys(plan(baseEvents.map((e) => (e.id === 'k' ? { ...e, matchTimeSec: 123.3 } : e.id === 'w' ? { ...e, matchTimeSec: 3511.3 } : e))))
        const d = same(a, moved)
        expect(d.changed).toEqual([])
        // Only blocks at the cut's two edges are new or gone (the whistle moved over a block line here, so two there).
        expect(d.added.length).toBeLessThanOrEqual(3)
        expect(a.size - d.kept).toBeLessThanOrEqual(3) // the first block (kick-off), the last, and the one holding the whistle
    })
    it('should leave interior blocks alone when replays are added (only where the cut is split)', () => {
        const a = unitKeys(plan(baseEvents))
        const withReplays = unitKeys(plan(baseEvents, { replays: true }))
        const d = same(a, withReplays)
        expect(d.changed).toEqual([])
        expect(a.size - d.kept).toBeLessThanOrEqual(4) // the block holding each split goes (and the cut's own ends stay)
    })
    it('should change only the blocks that a caption draws in when captions are switched on or a scorer changes', () => {
        const off = unitKeys(plan(baseEvents))
        const on = unitKeys(plan(baseEvents, { captions: true }))
        const d = same(off, on)
        expect(d.changed.length).toBeGreaterThanOrEqual(2)
        expect(d.changed.length).toBeLessThanOrEqual(6) // two goals, each in one or two blocks
        const other = unitKeys(plan(baseEvents.map((e) => (e.id === 'g2' ? { ...e, scorer: 'Alex' } : e)), { captions: true }))
        const d2 = same(on, other)
        expect(d2.changed.length).toBeGreaterThanOrEqual(1)
        expect(d2.changed.length).toBeLessThanOrEqual(2)
        // the first goal's blocks are untouched
        const near = (id: string): boolean => { const g = Number(id.split(':')[1]); return Math.abs(g * FS - 2412) < 30 }
        expect(d2.changed.every(near)).toBe(true)
    })
    it('should change only the blocks of a score bug window when its mode or a goal changes', () => {
        const none = unitKeys(plan(baseEvents, { scoreBug: 'off' }))
        const goals = unitKeys(plan(baseEvents, { scoreBug: 'goals' }))
        expect(same(none, goals).changed.length).toBeLessThanOrEqual(6)
        expect(same(none, goals).changed.length).toBeGreaterThanOrEqual(2)
        const more = unitKeys(plan([...baseEvents, goal('g3', 3000)], { scoreBug: 'goals' }))
        const d = same(goals, more)
        // a third goal changes the score shown after it? no: only its own window's blocks (and the full-time card, which is not a block)
        expect(d.changed.length).toBeLessThanOrEqual(3)
    })
    it('should change every key with the output quality or bitrate', () => {
        const a = unitKeys(plan(baseEvents))
        const rk = buildReuseKeys({ which: 'fullMatch', cuts: plan(baseEvents).cuts, sources: plan(baseEvents).sources, spec: plan(baseEvents).spec, quality: '1080p', videoBitrate: 10e6, logo: 'default' })
        const first = [...a.entries()][5]
        const sg = gridSegments(plan(baseEvents).cuts, FS, N, 3600)[5]
        const { a: s, b: e } = segmentSpan(plan(baseEvents).cuts[0], sg, FS)
        expect(rk.block(0, s, e)).not.toBe(first[1])
    })
})

describe('highlights blocks', () => {
    const hl = (events: MatchEvent[], captions = true): ExportPlan => highlightsExport({ ...state(events), graphics: { cards: true, lowerThirds: captions, replayTag: true, theme: 'shooot' } }, 'full', planOutput('4k'))
    it('should leave the other goals units alone when one goal is edited', () => {
        const a = unitKeys(hl(baseEvents))
        const edited = unitKeys(hl(baseEvents.map((e) => (e.id === 'g2' ? { ...e, scorer: 'Alex' } : e))))
        const d = same(a, edited)
        expect(d.changed.length).toBeGreaterThanOrEqual(1)
        // everything that changed lies around the second goal (2400 s)
        const around = d.changed.every((id) => { if (id.startsWith('timed')) return true; return Math.abs(Number(id.split(':')[1]) * FS - 2400) < 40 })
        expect(around).toBe(true)
        expect(d.kept).toBeGreaterThan(d.changed.length)
    })
    it('should keep the first goal blocks when a second goal is added', () => {
        const a = unitKeys(hl(baseEvents))
        const plus = unitKeys(hl([...baseEvents, goal('g3', 3000)]))
        expect(same(a, plus).changed).toEqual([])
    })
})
