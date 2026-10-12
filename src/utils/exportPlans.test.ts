import { describe, it, expect } from 'vitest'
import { clipExport, fullMatchExport, highlightsExport, type ExportState } from './exportPlans'
import { STING_SEC } from '../graphics/layout'
import type { MatchEvent, VideoSourceFile } from '../types'

const file = (name: string, kind: 'full' | 'proxy' = 'full', size = 1000): VideoSourceFile =>
    ({ id: name, name, url: '', file: new File([new Uint8Array(size)], name), durationSec: 100, kind })
const events: MatchEvent[] = [
    { id: 'k', type: 'kick_off', matchTimeSec: 30, sourceFileIndex: 0 },
    { id: 'g', type: 'goal', matchTimeSec: 60, sourceFileIndex: 0, team: 'Whites', scorer: 'Sam' },
    { id: 'w', type: 'final_whistle', matchTimeSec: 50, sourceFileIndex: 1 },
]
const state = (extra: Partial<ExportState> = {}): ExportState => ({
    files: [file('GX010001.MP4'), file('GX020001.MP4')], events, cumulativeOffsets: [0, 100],
    lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
    graphics: { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' },
    teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
    matchdayLabel: null, fullMatch: { cards: true, scoreBug: 'periodic', intervalMin: 5, captions: false, replays: false, quality: 'original' },
    ...extra,
})

describe('fullMatchExport output quality', () => {
    it('should estimate a stream copy from the file sizes and a re-encode from the bitrate and length', () => {
        const copy = fullMatchExport(state(), 'full')
        const enc = fullMatchExport(state(), 'full', { quality: '1080p', videoBitrate: 10e6 })
        expect(copy.output).toBeUndefined()
        expect(enc.output).toEqual({ quality: '1080p', videoBitrate: 10e6 })
        expect(enc.bytes).toBeCloseTo(((10e6 + 192_000) / 8) * enc.seconds, -3)
        expect(enc.seconds).toBe(copy.seconds)
    })
    it('should give each output quality and bitrate its own signature, so a saved render never resumes into another', () => {
        const sig = (o?: Parameters<typeof fullMatchExport>[2]): string => fullMatchExport(state(), 'full', o).signature
        expect(new Set([sig(), sig({ quality: '4k', videoBitrate: 20e6 }), sig({ quality: '1080p', videoBitrate: 10e6 }), sig({ quality: '1080p', videoBitrate: 8e6 })]).size).toBe(4)
        expect(sig()).toBe(fullMatchExport(state(), 'full').signature)
    })
    it('should keep the graphics plan the same in every quality (they are drawn into the frames)', () => {
        expect(fullMatchExport(state(), 'full', { quality: '4k', videoBitrate: 20e6 }).spec).toEqual(fullMatchExport(state(), 'full').spec)
    })
})

describe('fullMatchExport', () => {
    it('should cut kick-off → whistle across the files, named by score, resumable, with size and length', () => {
        const p = fullMatchExport(state(), 'full')
        expect(p.cuts).toEqual([{ sourceIndex: 0, startSec: 30, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 50 }])
        expect(p.outputName).toBe('Whites 1-0 Colours (full match).mp4')
        expect(p.seconds).toBe(120 + 8) // two 4 s cards
        expect(p.bytes).toBe(700 + 500)
        expect(p.resumable).toBe(true)
        expect(p.missing).toEqual([])
    })

    it('should insert replays only when asked: longer, signature changes, still resumable, tag over the replay', () => {
        const off = fullMatchExport(state(), 'full')
        const on = fullMatchExport(state({ fullMatch: { cards: true, scoreBug: 'periodic', intervalMin: 5, captions: false, replays: true, quality: 'original' }, graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot' } }), 'full')
        expect(on.cuts.map((c) => [c.sourceIndex, c.startSec, c.endSec, c.speed ?? 1])).toEqual([[0, 30, 61, 1], [0, 56, 61, 0.5], [0, 61, 100, 1], [1, 0, 50, 1]])
        expect(on.seconds).toBe(off.seconds + 10) // the 5 s replay at 0.5x is added; the match itself is not shortened
        expect(on.signature).not.toBe(off.signature)
        expect(on.resumable).toBe(true)
        expect(on.spec?.overlays.filter((o) => o.cutIndex === 1).map((o) => o.kind)).toEqual(['replayTag'])
        expect(on.bytes).toBeGreaterThan(off.bytes)
    })

    it('should plan VS / FT cards and periodic score bug windows on the cuts', () => {
        const p = fullMatchExport(state(), 'full')
        expect(p.spec?.intro?.heading).toBe('MATCH')
        expect(p.spec?.overlays.map((o) => [o.cutIndex, o.startSec, o.durationSec])).toEqual([[0, 30, 8], [0, 61, 5]])
        expect(fullMatchExport(state({ fullMatch: { cards: false, scoreBug: 'off', intervalMin: 5, captions: false, replays: false, quality: 'original' } }), 'full').spec).toBeUndefined()
    })

    it('should plan event captions only when the full-match setting is on', () => {
        const s = state({ events: [...state().events, { id: 'g9', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: state().teams[0].name }], fullMatch: { cards: false, scoreBug: 'off', intervalMin: 5, captions: true, replays: false, quality: 'original' } })
        expect(fullMatchExport(s, 'full').spec?.overlays.map((o) => o.kind)).toContain('caption')
        expect(fullMatchExport({ ...s, fullMatch: { ...s.fullMatch, captions: false, replays: false } }, 'full').spec).toBeUndefined()
    })

    it('should need the full files of a proxy timeline, unless rendering a preview', () => {
        const s = state({ files: [file('GL010001.LRV', 'proxy'), file('GL020001.LRV', 'proxy')] })
        expect(fullMatchExport(s, 'full').missing).toEqual(['GL010001.LRV', 'GL020001.LRV'])
        expect(fullMatchExport(s, 'preview')).toMatchObject({ missing: [], outputName: 'Whites 1-0 Colours (full match, preview).mp4' })
    })

    it('should change signature when the plan changes', () => {
        const a = fullMatchExport(state(), 'full').signature
        expect(fullMatchExport(state(), 'full').signature).toBe(a)
        expect(fullMatchExport(state({ fullMatch: { cards: true, scoreBug: 'goals', intervalMin: 5, captions: false, replays: false, quality: 'original' } }), 'full').signature).not.toBe(a)
    })
})

describe('highlightsExport', () => {
    it('should plan the reel stream copied, ignoring a legacy score-always-on setting', () => {
        const p = highlightsExport(state(), 'full')
        expect(p.outputName).toBe('Whites 1-0 Colours.mp4')
        expect(p.cuts.map((c) => [c.startSec, c.endSec, c.speed ?? 1])).toEqual([[50, 64, 1], [56, 61, 0.5]])
        expect(p.resumable).toBe(false)
        const legacy = highlightsExport(state({ graphics: { cards: true, lowerThirds: true, replayTag: false, scoreBug: true } as never }), 'full')
        expect(legacy.resumable).toBe(false)
        expect(legacy.spec?.overlays.some((o) => o.kind === 'scoreBug')).toBe(false)
    })
})

describe('highlightsExport — replay zoom', () => {
    const areas = { team1: { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }, team2: { x: 0.56, y: 0.3, w: 0.4, h: 0.4 } }
    it('should crop replays to the goal the scoring team attacks and leave clips whole', () => {
        const p = highlightsExport(state({ goalAreas: areas }), 'full')
        expect(p.cuts.map((c) => c.crop ?? null)).toEqual([null, areas.team2])
    })
    it('should change the job signature with the framing', () => {
        const a = highlightsExport(state({ goalAreas: areas }), 'full').signature
        const b = highlightsExport(state({ goalAreas: { team1: areas.team2, team2: areas.team1 } }), 'full').signature
        expect(a).not.toBe(b)
    })
    it('should not crop without goal areas', () => {
        expect(highlightsExport(state(), 'full').cuts.every((c) => !c.crop)).toBe(true)
    })
})

describe('clipExport', () => {
    const long = (name: string): VideoSourceFile => ({ ...file(name), durationSec: 600 })
    const clipEvents: MatchEvent[] = [
        { id: 'ko', type: 'kick_off', matchTimeSec: 0, sourceFileIndex: 0 },
        { id: 'G1', type: 'goal', matchTimeSec: 100, sourceFileIndex: 0, team: 'Whites', scorer: 'DJ' },
        { id: 'G2', type: 'goal', matchTimeSec: 105, sourceFileIndex: 0, team: 'Colours', scorer: 'Al' },
        { id: 'G3', type: 'goal', matchTimeSec: 3, sourceFileIndex: 1, team: 'Whites', scorer: 'Sam' },
        { id: 'U', type: 'goal', matchTimeSec: 50, sourceFileIndex: 0, unlinked: true, team: 'Whites' },
    ]
    const cs = (extra: Partial<ExportState> = {}): ExportState =>
        state({ files: [long('a.mp4'), long('b.mp4')], events: clipEvents, cumulativeOffsets: [0, 600], ...extra })
    const both = { replay: true, score: true }
    it('should only list the proxy-only files the clip reads as missing', () => {
        const s = cs({ files: [long('a.mp4'), long('b.mp4'), file('GL030001.LRV', 'proxy')], cumulativeOffsets: [0, 600, 1200] })
        expect(clipExport(s, 'G1', both, 'full')!.missing).toEqual([])
        const t = cs({ files: [long('a.mp4'), { ...long('b.mp4'), kind: 'proxy' }, file('GL030001.LRV', 'proxy')], cumulativeOffsets: [0, 600, 1200] })
        expect(clipExport(t, 'G3', both, 'full')!.missing).toContain('b.mp4')
        expect(clipExport(t, 'G3', both, 'full')!.missing).not.toContain('GL030001.LRV')
        expect(clipExport(t, 'G1', both, 'full')!.missing).not.toContain('b.mp4')
    })
    const captions = (p: NonNullable<ReturnType<typeof clipExport>>) => p.spec!.overlays.filter((o) => o.kind === 'caption')

    it('should cut only that event with its padding, then its replay', () => {
        const p = clipExport(cs(), 'G1', both, 'full')!
        expect(p.cuts.filter((c) => (c.speed ?? 1) === 1)).toEqual([{ sourceIndex: 0, startSec: 90, endSec: 104 }])
        expect(p.cuts.some((c) => (c.speed ?? 1) < 1)).toBe(true)
        expect(p.kind).toBe('clip')
    })
    it('should leave the replay out when the option is off or the event has none', () => {
        expect(clipExport(cs(), 'G1', { replay: false, score: true }, 'full')!.cuts.every((c) => (c.speed ?? 1) === 1)).toBe(true)
        const s = cs({ events: clipEvents.map((e) => (e.id === 'G1' ? { ...e, replay: false } : e)) })
        expect(clipExport(s, 'G1', both, 'full')!.cuts.every((c) => (c.speed ?? 1) === 1)).toBe(true)
    })
    it('should caption only that event even with a neighbour inside its padding', () => {
        const caps = captions(clipExport(cs(), 'G1', { replay: false, score: true }, 'full')!)
        expect(caps).toHaveLength(1)
        expect(caps[0].kind === 'caption' && caps[0].spec.person).toBe('DJ')
    })
    it('should split a clip across the file boundary and caption only the part with the event', () => {
        const p = clipExport(cs(), 'G3', { replay: false, score: true }, 'full')!
        expect(p.cuts.map((c) => [c.sourceIndex, c.startSec, c.endSec])).toEqual([[0, 593, 600], [1, 0, 7]])
        const caps = captions(p)
        expect(caps.length).toBeGreaterThan(0)
        expect(caps.every((o) => p.cuts[o.cutIndex].sourceIndex === 1)).toBe(true)
    })
    it('should carry the chosen caption on into its replay cut', () => {
        const p = clipExport(cs(), 'G1', both, 'full')!
        const caps = captions(p)
        expect(caps.some((o) => (p.cuts[o.cutIndex].speed ?? 1) < 1)).toBe(true)
        expect(caps.some((o) => (p.cuts[o.cutIndex].speed ?? 1) === 1)).toBe(true)
    })
    it('should end with the sting and have no title or full-time card', () => {
        const p = clipExport(cs(), 'G1', { replay: false, score: true }, 'full')!
        expect(p.spec?.intro).toBeUndefined()
        expect(p.spec?.outro).toEqual({ kind: 'sting' })
    })
    it('should count the sting in the clip length', () => {
        const p = clipExport(cs(), 'G1', { replay: false, score: true }, 'full')!
        expect(p.seconds).toBe(14 + STING_SEC)
    })
    it('should drop the score from the caption when the option is off', () => {
        const on = captions(clipExport(cs(), 'G1', { replay: false, score: true }, 'full')!)
        const off = captions(clipExport(cs(), 'G1', { replay: false, score: false }, 'full')!)
        expect(on.every((o) => o.kind === 'caption' && !!o.spec.bug)).toBe(true)
        expect(off.every((o) => o.kind === 'caption' && !o.spec.bug)).toBe(true)
    })
    it('should name the file from title and score, minute, type and person', () => {
        expect(clipExport(cs(), 'G1', both, 'full')!.outputName).toBe("Whites 2-1 Colours - 2' Goal DJ.mp4")
        expect(clipExport(cs(), 'G1', both, 'preview')!.outputName).toBe("Whites 2-1 Colours - 2' Goal DJ (preview).mp4")
    })
    it('should refuse markers, unknown and unlinked events', () => {
        expect(clipExport(cs(), 'ko', both, 'full')).toBeNull()
        expect(clipExport(cs(), 'nope', both, 'full')).toBeNull()
        expect(clipExport(cs(), 'U', both, 'full')).toBeNull()
    })
})
