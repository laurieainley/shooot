import { describe, it, expect } from 'vitest'
import { clipsSummary, fullMatchSummary, graphicsSummary, qualityShortReason, renderButtonLabel, renderSummaryLine, renderTimeText } from './renderSummary'
import type { QualityOption } from './outputQuality'

const MB = 1024 ** 2

describe('renderTimeText', () => {
    it('should use the midpoint of the range, in whole minutes', () => {
        // 600 s reel, 0.4–0.6 -> midpoint 0.5 -> 300 s -> 5 min
        expect(renderTimeText([0.4, 0.6], 600)).toBe('about 5 min')
    })
    it('should round to the nearest whole minute', () => {
        expect(renderTimeText([0.65, 1.1], 49 * 60)).toBe('about 43 min')
    })
    it('should say under a minute below one minute', () => {
        expect(renderTimeText([0.4, 0.6], 60)).toBe('under a minute')
        expect(renderTimeText([0.8, 1.3], 30)).toBe('under a minute')
    })
    it('should say quick for a stream copy (no range)', () => {
        expect(renderTimeText(null, 3000)).toBe('quick')
    })
})

describe('renderSummaryLine', () => {
    it('should give the size and one time figure for this device', () => {
        expect(renderSummaryLine({ bytes: 418 * MB, timeRange: [0.4, 0.6], seconds: 600, basis: 'this device' })).toBe('About 418 MB · about 5 min on this device')
        expect(renderSummaryLine({ bytes: 418 * MB, timeRange: [0.4, 0.6], seconds: 600, basis: 'typical' })).toBe('About 418 MB · about 5 min')
    })
    it('should say quick for a stream copy without a time estimate', () => {
        expect(renderSummaryLine({ bytes: 3 * 1024 ** 3, timeRange: null, seconds: 3000 })).toBe('About 3.0 GB · quick')
    })
})

describe('renderButtonLabel', () => {
    it('should name the output and add the quality unless Original', () => {
        expect(renderButtonLabel('highlights', 'original')).toBe('Render highlights')
        expect(renderButtonLabel('highlights', '1080p')).toBe('Render highlights · 1080p')
        expect(renderButtonLabel('full match', '4k')).toBe('Render full match · 4K')
    })
})

const opt = (o: Partial<QualityOption>): QualityOption => ({ id: '4k', label: '4K', disabled: true, reason: null, bytes: 1, timeRange: null, ...o })

describe('qualityShortReason', () => {
    it('should be null for an available option', () => {
        expect(qualityShortReason(opt({ disabled: false }))).toBeNull()
    })
    it('should shorten the reasons', () => {
        expect(qualityShortReason(opt({ reason: 'The footage is 1920×1080, not 4K.' }))).toBe('needs 4K footage')
        expect(qualityShortReason(opt({ id: '1080p', reason: 'This browser cannot encode 1080p H.264.' }))).toBe('not on this device')
        expect(qualityShortReason(opt({ reason: 'This browser cannot decode the footage’s video format, so it can only be copied (Original).' }))).toBe('not on this device')
        expect(qualityShortReason(opt({ noRoom: true, reason: 'Too big for this browser’s storage (about 9 GB needed, 2 GB available)' }))).toBe('too big')
        expect(qualityShortReason(opt({ reason: 'Load the match videos first.' }))).toBe('no footage')
    })
})

describe('settings summaries', () => {
    it('should recap clips and replays', () => {
        expect(clipsSummary({ before: 10, after: 4, replaySpeed: 0.5 })).toBe('10 s before · 4 s after · replays 0.5×')
    })
    it('should list the graphics that are on, with the theme', () => {
        expect(graphicsSummary({ cards: true, lowerThirds: true, replayTag: true }, 'Shooot')).toBe('Shooot · cards, captions, replay tag')
        expect(graphicsSummary({ cards: false, lowerThirds: true, replayTag: false }, 'Classic')).toBe('Classic · captions')
        expect(graphicsSummary({ cards: false, lowerThirds: false, replayTag: false }, 'Shooot')).toBe('Shooot · no graphics')
    })
    it('should list what the full match includes', () => {
        const fm = { cards: true, captions: true, replays: true, scoreBug: 'goals' as const, intervalMin: 5 }
        expect(fullMatchSummary(fm)).toBe('cards, captions, replays, score bug after goals')
        expect(fullMatchSummary({ ...fm, replays: false, scoreBug: 'periodic', intervalMin: 3 })).toBe('cards, captions, score bug every 3 min')
        expect(fullMatchSummary({ ...fm, cards: false, captions: false, replays: false, scoreBug: 'off' })).toBe('nothing added')
    })
})
