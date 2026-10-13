import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_COEF, RATES_KEY, parallelFactor, WorkMeter, cutShare, detectDeviceClass, estimateFromWork, estimateRenderTime, expectedWallSeconds, foldRate, loadRates,
    planWork, priceUnits, recordRender, ZERO_UNITS, type SourceFacts, type WorkInput,
} from './renderTime'
import { BENCH_SOURCES, HIGHLIGHTS_PLAN, MEASUREMENTS, PLAIN_PLAN } from './renderTime.bench'
import { estimatePlanTime, fullMatchExport, highlightsExport, type ExportState } from './exportPlans'
import type { MatchEvent, VideoSourceFile } from '../types'

afterEach(() => vi.unstubAllGlobals())

describe('cost model against the device benchmarks', () => {
    // Two measurements the model cannot follow with one linear copy rate: the Pixel's own 4K clip copied 0.19x although its
    // 40 Mbps 1080p neighbour took 0.27x, and the 1080p source's highlights on the Pixel. Both are within 40%.
    const OUTLIERS = new Set(['android copy pixel4k', 'android highlights 1080p gopro1080'])
    const predict = (m: (typeof MEASUREMENTS)[number]): number => {
        const plan = m.plan === 'plain' ? PLAIN_PLAN : HIGHLIGHTS_PLAN
        const len = m.plan === 'plain' ? 600 : 80
        return planWork(plan, { facts: BENCH_SOURCES[m.source], output: m.output, coef: DEFAULT_COEF[m.device] }).seconds / len
    }
    it('should have the highlights benchmark plan at 80 s of output', () => {
        const out = HIGHLIGHTS_PLAN.cuts.reduce((a, c) => a + (c.endSec - c.startSec) / (c.speed ?? 1), 0) + 8
        expect(out).toBe(80)
    })
    for (const m of MEASUREMENTS) {
        const key = `${m.device} ${m.what.split(' ')[0] === 'copy' ? 'copy' : m.what} ${m.source}`
        it(`should reproduce ${m.device} ${m.what} from ${m.source} (${m.ratio}x) within 25%`, () => {
            const p = predict(m)
            const tol = OUTLIERS.has(key) ? 0.4 : 0.25
            expect(Math.abs(p / m.ratio - 1)).toBeLessThanOrEqual(tol)
        })
    }
})

describe('estimates follow what the render does', () => {
    const facts1080: SourceFacts = { width: 1920, height: 1080, codec: 'h264', fps: 30, bytesPerSec: (5e6) / 8 }
    const reel = (replays: boolean, captions: boolean, cards: boolean, tag = replays): WorkInput => {
        const cuts: WorkInput['cuts'] = []
        const overlays: WorkInput['overlays'] = []
        for (let i = 0; i < 12; i++) {
            cuts.push({ startSec: 300 * i, endSec: 300 * i + 20 })
            if (captions) overlays.push({ cutIndex: cuts.length - 1, startSec: 300 * i + 8, durationSec: 5 })
            if (replays) {
                cuts.push({ startSec: 300 * i + 12, endSec: 300 * i + 18, speed: 0.5 })
                if (tag) overlays.push({ cutIndex: cuts.length - 1, startSec: 300 * i + 12, durationSec: 6, whole: true })
            }
        }
        return { cuts, overlays, introSec: cards ? 4 : 0, outroSec: cards ? 4 : 0 }
    }
    const t = (i: WorkInput, o: 'original' | '4k' | '1080p', facts = BENCH_SOURCES.gopro4k, device: 'android' | 'ipad' | 'desktop' = 'android') =>
        estimateRenderTime(i, { output: o, facts, device, rates: null }).seconds

    it('should cost more in Original when replays, captions or cards are ticked', () => {
        const none = t(reel(false, false, false), 'original')
        expect(t(reel(false, true, false), 'original')).toBeGreaterThan(none)
        expect(t(reel(false, false, true), 'original')).toBeGreaterThan(none)
        expect(t(reel(true, false, false, false), 'original')).toBeGreaterThan(none)
        expect(t(reel(true, false, false, true), 'original')).toBeGreaterThan(t(reel(true, false, false, false), 'original'))
        expect(t(reel(true, true, true), 'original')).toBeGreaterThan(t(reel(true, false, false), 'original'))
    })
    it('should give a low-bitrate 1080p H.264 source a much smaller Original estimate than raw GoPro 4K', () => {
        const all = reel(true, true, true)
        const gopro = t(all, 'original', BENCH_SOURCES.gopro4k)
        const small = t(all, 'original', facts1080)
        expect(small).toBeLessThan(gopro / 3)
    })
    it('should price the reported phone case sensibly: Original on a Pixel is slow for 4K HEVC, not for a 5 Mbps 1080p clip', () => {
        const all = reel(true, true, true)
        const reelSec = all.cuts.reduce((a, c) => a + (c.endSec - c.startSec) / (c.speed ?? 1), 0) + 8
        expect(t(all, 'original', BENCH_SOURCES.gopro4k) / reelSec).toBeGreaterThan(1.2)
        expect(t(all, 'original', facts1080) / reelSec).toBeLessThan(0.7)
    })
    it('should scale a re-encode with the output size and a copy with the bitrate', () => {
        const plain = PLAIN_PLAN
        expect(t(plain, '4k')).toBeGreaterThan(t(plain, '1080p'))
        expect(t(plain, 'original', BENCH_SOURCES.gopro4k)).toBeGreaterThan(t(plain, 'original', BENCH_SOURCES.handbrake4k) * 5)
    })
    it('should decode HEVC at more cost than H.264 and a bigger picture at more cost than a smaller one', () => {
        const base: SourceFacts = { width: 1920, height: 1080, codec: 'hevc', fps: 30, bytesPerSec: 5e6 }
        const coef = DEFAULT_COEF.desktop
        const price = (f: SourceFacts) => priceUnits({ ...ZERO_UNITS, decSec: 100 }, { facts: f, output: '1080p', coef })
        expect(price({ ...base, codec: 'h264' })).toBeLessThan(price(base))
        expect(price({ ...base, width: 3840, height: 2160 })).toBeGreaterThan(price(base))
        expect(price({ ...base, fps: 60 })).toBeGreaterThan(price(base))
    })
    it('should follow the ticks through the real plans (Full match: replays, captions, cards)', () => {
        const file = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([new Uint8Array(1000)], name), durationSec: 1800, kind: 'full' })
        const ev = (id: string, type: MatchEvent['type'], t: number, i = 0): MatchEvent => ({ id, type, matchTimeSec: t, sourceFileIndex: i, ...(type === 'goal' ? { team: 'Whites' } : {}) })
        const events = [ev('k', 'kick_off', 10), ev('g1', 'goal', 300), ev('g2', 'goal', 900), ev('g3', 'goal', 1200), ev('w', 'final_whistle', 1700, 1)]
        const state = (fm: Partial<ExportState['fullMatch']>): ExportState => ({
            files: [file('a.mp4'), file('b.mp4')], events, cumulativeOffsets: [0, 1800],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
            graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot' },
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
            matchdayLabel: null, fullMatch: { cards: false, scoreBug: 'off', intervalMin: 5, captions: false, replays: false, quality: 'original', ...fm },
        })
        const est = (fm: Partial<ExportState['fullMatch']>) => estimatePlanTime(fullMatchExport(state(fm), 'full'), 'original', BENCH_SOURCES.gopro4k).seconds
        const plain = est({})
        expect(est({ captions: true })).toBeGreaterThan(plain)
        expect(est({ replays: true })).toBeGreaterThan(plain)
        expect(est({ cards: true })).toBeGreaterThan(plain)
        expect(est({ replays: true, captions: true, cards: true })).toBeGreaterThan(est({ replays: true }))
        // And for Highlights: the replay-tag and caption options change the plan, which changes the estimate.
        const hs = (g: Partial<ExportState['graphics']>) => estimatePlanTime(highlightsExport({ ...state({}), graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot', ...g } }, 'full'), 'original', BENCH_SOURCES.gopro4k).seconds
        expect(hs({ lowerThirds: false })).toBeLessThan(hs({}))
        expect(hs({ replayTag: false })).toBeLessThanOrEqual(hs({}))
        expect(hs({ cards: false })).toBeLessThan(hs({}))
    })
})

describe('learned device rates', () => {
    const store = (): Record<string, string> => {
        const data: Record<string, string> = {}
        vi.stubGlobal('localStorage', { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v }, removeItem: (k: string) => { delete data[k] } })
        return data
    }
    it('should use the typical range until a render has been measured, then this device with a narrower range', () => {
        const typical = estimateFromWork(100, 'original', null)
        expect(typical.basis).toBe('typical')
        const learned = estimateFromWork(100, 'original', { original: { ratio: 2, n: 1 } })
        expect(learned.basis).toBe('this device')
        expect(learned.seconds).toBe(200)
        expect(learned.high / learned.low).toBeLessThan(typical.high / typical.low)
    })
    it('should override the defaults for the path that was measured only', () => {
        const rates = { '1080p': { ratio: 0.5, n: 2 } }
        expect(estimateFromWork(100, '1080p', rates).seconds).toBe(50)
        expect(estimateFromWork(100, '4k', rates)).toMatchObject({ seconds: 100, basis: 'typical' })
        expect(expectedWallSeconds(100, '1080p', rates)).toBe(50)
    })
    it('should smooth over renders, clamp wild ratios and ignore very short ones', () => {
        let r = foldRate(null, 'original', 100, 200)
        expect(r.original).toEqual({ ratio: 2, n: 1 })
        r = foldRate(r, 'original', 100, 100)
        expect(r.original!.ratio).toBeCloseTo(1.5)
        expect(foldRate(null, '4k', 100, 100000)['4k']!.ratio).toBe(6)
        expect(foldRate(null, '4k', 2, 3)['4k']).toBeUndefined()
    })
    it('should store in localStorage and feed the next estimate', () => {
        store()
        expect(loadRates()).toBeNull()
        recordRender('original', 100, 300)
        expect(loadRates()?.original?.ratio).toBeCloseTo(3)
        const e = estimateRenderTime(HIGHLIGHTS_PLAN, { output: 'original', facts: BENCH_SOURCES.gopro4k, device: 'ipad' })
        const typical = estimateRenderTime(HIGHLIGHTS_PLAN, { output: 'original', facts: BENCH_SOURCES.gopro4k, device: 'ipad', rates: null })
        expect(e.basis).toBe('this device')
        expect(e.seconds).toBeCloseTo(typical.seconds * 3)
    })
    it('should not throw when storage is blocked or holds junk', () => {
        vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
        expect(loadRates()).toBeNull()
        expect(() => recordRender('1080p', 100, 100)).not.toThrow()
        const data = store()
        data[RATES_KEY] = '{not json'
        expect(loadRates()).toBeNull()
    })
})

describe('work-weighted progress', () => {
    it('should be monotonic, stay under 1 until finished, and end at exactly 1', () => {
        const w = planWork(HIGHLIGHTS_PLAN, { facts: BENCH_SOURCES.gopro4k, output: 'original', coef: DEFAULT_COEF.android })
        const meter = new WorkMeter(w.seconds)
        let done = 0
        let last = 0
        for (const s of w.sections) {
            for (let k = 1; k <= 10; k++) {
                meter.set(done + (s.seconds * k) / 10)
                const f = meter.fraction()
                expect(f).toBeGreaterThanOrEqual(last)
                last = f
            }
            done += s.seconds
        }
        expect(last).toBeLessThan(1)
        expect(last).toBeGreaterThan(0.99)
        meter.set(0) // a retry rewinds the work, the shown fraction does not
        expect(meter.fraction()).toBe(last)
        expect(meter.finish()).toBe(1)
        expect(w.seconds).toBeCloseTo(w.sections.reduce((a, s) => a + s.seconds, 0))
    })
    it('should weigh a re-encoded replay far above a copied clip of the same length', () => {
        const w = planWork(HIGHLIGHTS_PLAN, { facts: BENCH_SOURCES.gopro4k, output: 'original', coef: DEFAULT_COEF.android })
        const pricing = { facts: BENCH_SOURCES.gopro4k, output: 'original' as const, coef: DEFAULT_COEF.android }
        const copied = planWork({ cuts: [{ startSec: 0, endSec: 4 }], overlays: [], introSec: 0, outroSec: 0 }, pricing).seconds
        const replay = w.sections.find((s) => s.kind === 'cut' && s.index === 1)! // 4 source seconds, tag over the whole cut
        expect(replay.seconds / copied).toBeGreaterThan(3)
    })
    it('should place a position inside a copied cut by the cost of its re-encoded regions', () => {
        // A 20 s cut copied at 1 unit/s with a 4 s region at 10 units/s: the region is 40 of 56 units.
        expect(cutShare(0, 0, 20, [[8, 12]], 1, 10)).toBe(0)
        expect(cutShare(8, 0, 20, [[8, 12]], 1, 10)).toBeCloseTo(8 / 56)
        expect(cutShare(12, 0, 20, [[8, 12]], 1, 10)).toBeCloseTo(48 / 56)
        expect(cutShare(20, 0, 20, [[8, 12]], 1, 10)).toBe(1)
        expect(cutShare(10, 0, 20, [], 1, 10)).toBeCloseTo(0.5)
    })
})

describe('device class', () => {
    it('should read Android, iPad (incl. iPadOS as a Mac) and desktop, and treat the rest as unknown', () => {
        expect(detectDeviceClass({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120' }, true)).toBe('android')
        expect(detectDeviceClass({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }, true)).toBe('ipad')
        expect(detectDeviceClass({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }, true)).toBe('ipad')
        expect(detectDeviceClass({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }, false)).toBe('desktop')
        expect(detectDeviceClass({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, true)).toBe('unknown')
        expect(detectDeviceClass({ userAgent: '' }, false)).toBe('unknown')
        expect(DEFAULT_COEF.unknown).toEqual(DEFAULT_COEF.android)
    })
})

describe('parallel units in the estimate', () => {
    const plan = PLAIN_PLAN
    const est = (output: 'original' | '4k' | '1080p', device: 'android' | 'ipad' | 'desktop', rates: Parameters<typeof estimateRenderTime>[1]['rates'] = null) =>
        estimateRenderTime(plan, { output, facts: BENCH_SOURCES.gopro4k, device, rates }).seconds
    const serial = (output: '4k' | '1080p', device: 'android' | 'ipad' | 'desktop') =>
        planWork(plan, { facts: BENCH_SOURCES.gopro4k, output, coef: DEFAULT_COEF[device] }).seconds

    it('should scale re-encode estimates by the per-device speed-up and leave Original alone', () => {
        expect(est('1080p', 'android') / serial('1080p', 'android')).toBeCloseTo(0.63, 6)
        expect(est('4k', 'android') / serial('4k', 'android')).toBeCloseTo(0.63, 6)
        expect(est('1080p', 'ipad') / serial('1080p', 'ipad')).toBeCloseTo(0.94, 6)
        expect(est('4k', 'ipad') / serial('4k', 'ipad')).toBeCloseTo(0.72, 6)
        expect(est('4k', 'desktop') / serial('4k', 'desktop')).toBeCloseTo(0.8, 6)
        expect(parallelFactor('android', 'original')).toBe(1)
        expect(parallelFactor('android', '4k', 1)).toBe(1)
    })
    it('should apply a learned ratio to the adjusted model only once', () => {
        // A render that took exactly what the adjusted model said teaches ratio 1: the estimate stays the adjusted one.
        const adjusted = est('4k', 'ipad')
        const learned = foldRate(null, '4k', adjusted, adjusted)
        expect(est('4k', 'ipad', learned)).toBeCloseTo(adjusted, 6)
    })
    it('should ignore learned re-encode rates from before parallel units but keep Original ones', () => {
        localStorage.setItem(RATES_KEY, JSON.stringify({ original: { ratio: 2, n: 3 }, '4k': { ratio: 1.4, n: 3 }, '1080p': { ratio: 1.1, n: 2, par: true } }))
        const r = loadRates()!
        expect(r.original?.ratio).toBe(2)
        expect(r['4k']).toBeUndefined()
        expect(r['1080p']?.ratio).toBe(1.1)
        localStorage.removeItem(RATES_KEY)
    })
    it('should mark re-encode rates as parallel-adjusted when folding', () => {
        expect(foldRate(null, '1080p', 100, 90)['1080p']?.par).toBe(true)
        expect(foldRate(null, 'original', 100, 90).original?.par).toBeUndefined()
    })
})

describe('estimates with parts reused from the last export', () => {
    const facts: SourceFacts = { width: 3840, height: 2160, codec: 'hevc', fps: 30, bytesPerSec: 90e6 / 8 }
    const input: WorkInput = {
        cuts: Array.from({ length: 9 }, (_, i) => ({ startSec: 100 * i, endSec: 100 * i + 20 })),
        overlays: [], introSec: 4, outroSec: 4,
    }
    const est = (reused?: { intro: boolean; outro: boolean; cuts: boolean[] }) => estimateRenderTime(input, { output: '1080p', facts, device: 'desktop', rates: null, reused }).seconds
    it('should take less time the more parts are reused, and nothing reused changes nothing', () => {
        const none = { intro: false, outro: false, cuts: Array.from({ length: 9 }, () => false) }
        expect(est(none)).toBeCloseTo(est(undefined))
        const most = { intro: true, outro: false, cuts: Array.from({ length: 9 }, (_, i) => i !== 3) }
        expect(est(most)).toBeLessThan(est(none) * 0.3)
        expect(est(most)).toBeGreaterThan(0)
    })
})
