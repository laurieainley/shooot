import { describe, it, expect } from 'vitest'
import { buildReuseKeys, cacheCap, canonical, digest, planEviction, CACHE_CAP_BYTES } from './unitCache'
import type { Cut, RenderSource } from './types'
import type { GraphicsSpec, OverlaySpec } from '../graphics/types'

const file = (name: string, size: number, lastModified: number): RenderSource => ({ name, file: { size, lastModified } as unknown as File })
const badge = { name: 'A', colour: '#fff' } as never
const caption = (cutIndex: number, startSec: number, person: string): OverlaySpec => ({
    kind: 'caption', cutIndex, startSec, durationSec: 5, label: `G ${person}`, clock: { offsetSec: 0, rate: 1, totalSec: 5 },
    spec: { label: 'GOAL!', person, stripe: '#f00' },
})
const base = {
    which: 'fullMatch' as const,
    cuts: [{ sourceIndex: 0, startSec: 10, endSec: 20 }, { sourceIndex: 0, startSec: 100, endSec: 110 }, { sourceIndex: 0, startSec: 200, endSec: 260 }] as Cut[],
    sources: [file('a.mp4', 1000, 5)],
    spec: {
        theme: 'shooot', intro: { heading: 'H', centre: 'C', left: badge, right: badge },
        outro: { heading: 'FT', centre: '2-1', left: badge, right: badge, scorers: { left: [{ name: 'X', minutes: "3'" }], right: [] } },
        overlays: [caption(0, 12, 'A'), caption(1, 102, 'B')],
    } as unknown as GraphicsSpec,
    quality: '1080p', videoBitrate: 8e6, logo: 'default',
}
const k = (o: Partial<typeof base> = {}) => buildReuseKeys({ ...base, ...o })
const cut1 = (o: Partial<typeof base> = {}) => k(o).cut(1, 100, 110)

describe('reuse keys', () => {
    it('should be equal for equal inputs', () => {
        expect(cut1()).toBe(cut1())
        expect(k().intro).toBe(k().intro)
    })
    it('should change when the source file changes (name, size, modified time)', () => {
        const same = cut1()
        expect(cut1({ sources: [file('b.mp4', 1000, 5)] })).not.toBe(same)
        expect(cut1({ sources: [file('a.mp4', 1001, 5)] })).not.toBe(same)
        expect(cut1({ sources: [file('a.mp4', 1000, 6)] })).not.toBe(same)
    })
    it('should change with the cut times, speed, crop, gain and silence', () => {
        const same = cut1()
        for (const patch of [{ startSec: 101 }, { endSec: 111 }, { speed: 0.5 }, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, { gain: 0.5 }, { silent: true }]) {
            const cuts = base.cuts.map((c, i) => (i === 1 ? { ...c, ...patch } : c))
            expect(cut1({ cuts })).not.toBe(same)
        }
    })
    it('should change with the output quality, bitrate and logo', () => {
        const same = cut1()
        expect(cut1({ quality: '4k' })).not.toBe(same)
        expect(cut1({ videoBitrate: 9e6 })).not.toBe(same)
        expect(cut1({ logo: 'abc' })).not.toBe(same)
    })
    it('should change with the theme and with the overlays drawn in the unit, but not with other cuts', () => {
        const same = cut1()
        expect(cut1({ spec: { ...base.spec!, theme: 'other' } as unknown as GraphicsSpec })).not.toBe(same)
        const edited = { ...base.spec!, overlays: [caption(0, 12, 'A'), caption(1, 102, 'Different')] } as GraphicsSpec
        expect(cut1({ spec: edited })).not.toBe(same)
        // Changing goal 1's caption leaves goal 2's unit alone.
        const other = { ...base.spec!, overlays: [caption(0, 12, 'Different'), caption(1, 102, 'B')] } as GraphicsSpec
        expect(cut1({ spec: other })).toBe(same)
        expect(k({ spec: other }).cut(0, 10, 20)).not.toBe(k().cut(0, 10, 20))
        // With no graphics at all the unit differs from one with graphics.
        expect(cut1({ spec: undefined })).not.toBe(same)
    })
    it('should only include the overlays that overlap the unit', () => {
        const spec = { ...base.spec!, overlays: [caption(2, 205, 'A'), caption(2, 250, 'B')] } as GraphicsSpec
        const spec2 = { ...base.spec!, overlays: [caption(2, 205, 'A'), caption(2, 250, 'Changed')] } as GraphicsSpec
        // The unit of cut 2 covering 200-230 is untouched by a change at 250.
        expect(k({ spec }).cut(2, 200, 230)).toBe(k({ spec: spec2 }).cut(2, 200, 230))
        expect(k({ spec }).cut(2, 240, 260)).not.toBe(k({ spec: spec2 }).cut(2, 240, 260))
    })
    it('should not shift when an earlier cut is removed (indices are not part of the key)', () => {
        const without = { ...base, cuts: base.cuts.slice(1), spec: { ...base.spec!, overlays: [caption(0, 102, 'B')] } as GraphicsSpec }
        expect(k(without).cut(0, 100, 110)).toBe(cut1())
    })
    it('should change a replay when the clip before it (whose caption it carries on) changes', () => {
        const carry = (person: string): GraphicsSpec => ({ ...base.spec!, overlays: [{ ...caption(0, 12, person), toCutEnd: true } as OverlaySpec, { ...caption(1, 100, person), fromCutStart: true } as OverlaySpec] } as GraphicsSpec)
        expect(k({ spec: carry('A') }).cut(1, 100, 110)).not.toBe(k({ spec: carry('B') }).cut(1, 100, 110))
    })
    it('should change the full-time card when the scorers change', () => {
        const outro = (name: string): GraphicsSpec => ({ ...base.spec!, outro: { ...(base.spec!.outro as object), scorers: { left: [{ name, minutes: "3'" }], right: [] } } } as unknown as GraphicsSpec)
        expect(k({ spec: outro('X') }).outro).not.toBe(k({ spec: outro('Y') }).outro)
        expect(k({ spec: outro('X') }).intro).toBe(k({ spec: outro('Y') }).intro)
    })
})

describe('canonical and digest', () => {
    it('should ignore key order and undefined fields', () => {
        expect(canonical({ a: 1, b: { d: 2, c: undefined } })).toBe(canonical({ b: { d: 2 }, a: 1 }))
    })
    it('should give 32 hex characters that differ for different input', async () => {
        const a = await digest({ x: 1 })
        expect(a).toMatch(/^[0-9a-f]{32}$/)
        expect(await digest({ x: 2 })).not.toBe(a)
    })
})

describe('cache size and eviction', () => {
    const e = (key: string, bytes: number, at: number, order = 0) => ({ key, bytes, at, order })
    it('should drop every unit no export refers to', () => {
        expect(planEviction([e('a', 10, 1), e('b', 10, 1), e('orphan', 10, 0)], new Set(['a', 'b']), 1000)).toEqual(['orphan'])
    })
    it('should evict the oldest export first while over the cap, later units of a reel before earlier ones', () => {
        const entries = [e('old1', 40, 1, 0), e('old2', 40, 1, 1), e('new1', 40, 2, 0), e('new2', 40, 2, 1)]
        const drop = planEviction(entries, new Set(entries.map((x) => x.key)), 125)
        expect(drop).toEqual(['old2'])
        expect(planEviction(entries, new Set(entries.map((x) => x.key)), 50)).toEqual(['old2', 'old1', 'new2'])
    })
    it('should cap at a quarter of the quota, and at the fixed cap', () => {
        expect(cacheCap(10.7e9)).toBeCloseTo(2.675e9)
        expect(cacheCap(41e9)).toBe(CACHE_CAP_BYTES)
        expect(cacheCap(null)).toBe(CACHE_CAP_BYTES)
    })
})
