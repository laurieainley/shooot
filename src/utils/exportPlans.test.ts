import { describe, it, expect } from 'vitest'
import { fullMatchExport, highlightsExport, type ExportState } from './exportPlans'
import type { MatchEvent, VideoSourceFile } from '../types'

const file = (name: string, kind: 'full' | 'proxy' = 'full', size = 1000): VideoSourceFile =>
    ({ id: name, name, url: '', file: new File([new Uint8Array(size)], name), durationSec: 100, kind })
const events: MatchEvent[] = [
    { id: 'k', type: 'kick_off', matchTimeSec: 30, sourceFileIndex: 0 },
    { id: 'g', type: 'goal', matchTimeSec: 60, sourceFileIndex: 0, team: 'Whites', scorer: 'Sam' },
    { id: 'w', type: 'final_whistle', matchTimeSec: 50, sourceFileIndex: 1 },
]
const state = (extra: Partial<ExportState> = {}): ExportState => ({
    files: [file('GX010001.MP4'), file('GX020001.MP4')], events, cumulativeOffsets: [0, 100], adjustTimestampsByOffset: false,
    lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
    graphics: { cards: true, lowerThirds: true, replayTag: false },
    teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
    matchdayLabel: null, fullMatch: { cards: true, scoreBug: 'periodic', intervalMin: 5 },
    ...extra,
})

describe('fullMatchExport', () => {
    it('should cut kick-off → whistle across the files, named full-match.mp4, resumable, with size and length', () => {
        const p = fullMatchExport(state(), 'full')
        expect(p.cuts).toEqual([{ sourceIndex: 0, startSec: 30, endSec: 100 }, { sourceIndex: 1, startSec: 0, endSec: 50 }])
        expect(p.outputName).toBe('full-match.mp4')
        expect(p.seconds).toBe(120 + 8) // two 4 s cards
        expect(p.bytes).toBe(700 + 500)
        expect(p.resumable).toBe(true)
        expect(p.missing).toEqual([])
    })

    it('should plan VS / FT cards and periodic score bug windows on the cuts', () => {
        const p = fullMatchExport(state(), 'full')
        expect(p.spec?.intro?.heading).toBe('MATCH')
        expect(p.spec?.overlays.map((o) => [o.cutIndex, o.startSec, o.durationSec])).toEqual([[0, 30, 8], [0, 60, 10]])
        expect(fullMatchExport(state({ fullMatch: { cards: false, scoreBug: 'off', intervalMin: 5 } }), 'full').spec).toBeUndefined()
    })

    it('should need the full files of a proxy timeline, unless rendering a preview', () => {
        const s = state({ files: [file('GL010001.LRV', 'proxy'), file('GL020001.LRV', 'proxy')] })
        expect(fullMatchExport(s, 'full').missing).toEqual(['GL010001.LRV', 'GL020001.LRV'])
        expect(fullMatchExport(s, 'preview')).toMatchObject({ missing: [], outputName: 'full-match-preview.mp4' })
    })

    it('should change signature when the plan changes', () => {
        const a = fullMatchExport(state(), 'full').signature
        expect(fullMatchExport(state(), 'full').signature).toBe(a)
        expect(fullMatchExport(state({ fullMatch: { cards: true, scoreBug: 'goals', intervalMin: 5 } }), 'full').signature).not.toBe(a)
    })
})

describe('highlightsExport', () => {
    it('should plan the reel stream copied, ignoring a legacy score-always-on setting', () => {
        const p = highlightsExport(state(), 'full')
        expect(p.outputName).toBe('highlights.mp4')
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
