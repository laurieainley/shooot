import { describe, it, expect } from 'vitest'
import { buildReuseKeys, cacheCap, canonical, capFor, digest, planEviction, CACHE_CAP_BYTES } from './unitCache'
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

describe('logoFingerprint', () => {
    it('should tell the default badge from no logo', async () => {
        const { logoFingerprint } = await import('./unitCache')
        expect(await logoFingerprint(null)).toBe('default')
        expect(await logoFingerprint('none')).toBe('none')
    })
})

describe('block keys (grid blocks of a normal-speed cut)', () => {
    const blockBase = {
        ...base,
        cuts: [{ sourceIndex: 0, startSec: 100, endSec: 700 }] as Cut[],
        spec: { theme: 'shooot', overlays: [caption(0, 305, 'A'), caption(0, 502, 'B')] } as unknown as GraphicsSpec,
    }
    const b = (o: Partial<typeof blockBase> = {}, a = 200, z = 210.01) => buildReuseKeys({ ...blockBase, ...o }).block(0, a, z)

    it('should not depend on where the cut starts or ends', () => {
        const same = b()
        expect(b({ cuts: [{ sourceIndex: 0, startSec: 133.3, endSec: 690 }] })).toBe(same)
        expect(b({ cuts: [{ sourceIndex: 0, startSec: 100, endSec: 700 }, { sourceIndex: 0, startSec: 900, endSec: 950 }] })).toBe(same)
    })
    it('should depend on the footage, the span, the quality and the cut treatment', () => {
        const same = b()
        expect(b({}, 210.01, 220.02)).not.toBe(same)
        expect(b({ sources: [file('a.mp4', 1000, 6)] })).not.toBe(same)
        expect(b({ quality: '4k' })).not.toBe(same)
        expect(b({ videoBitrate: 9e6 })).not.toBe(same)
        expect(b({ logo: 'abc' })).not.toBe(same)
        for (const patch of [{ crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, { silent: true }, { gain: 0.5 }, { speed: 0.5 }]) {
            expect(b({ cuts: [{ sourceIndex: 0, startSec: 100, endSec: 700, ...patch }] })).not.toBe(same)
        }
    })
    it('should change only for the blocks a caption or score bug draws in', () => {
        const spec = (person: string): GraphicsSpec => ({ theme: 'shooot', overlays: [caption(0, 305, person), caption(0, 502, 'B')] }) as unknown as GraphicsSpec
        // The caption at 305-310 sits in the block 300-310.01 only.
        expect(b({ spec: spec('Z') }, 300, 310.01)).not.toBe(b({}, 300, 310.01))
        expect(b({ spec: spec('Z') }, 290, 300)).toBe(b({}, 290, 300))
        expect(b({ spec: spec('Z') }, 310.01, 320.02)).toBe(b({}, 310.01, 320.02))
        // Adding a caption touches nothing else.
        const added = { theme: 'shooot', overlays: [caption(0, 305, 'A'), caption(0, 402, 'New'), caption(0, 502, 'B')] } as unknown as GraphicsSpec
        expect(b({ spec: added }, 400, 410.01)).not.toBe(b({}, 400, 410.01))
        expect(b({ spec: added }, 300, 310.01)).toBe(b({}, 300, 310.01))
        expect(b({ spec: added }, 500, 510.01)).toBe(b({}, 500, 510.01))
    })
    it('should key a caption that straddles two blocks in both, and the score bug scores in their blocks only', () => {
        const straddle = { theme: 'shooot', overlays: [caption(0, 308, 'A')] } as unknown as GraphicsSpec
        const other = { theme: 'shooot', overlays: [caption(0, 308, 'Z')] } as unknown as GraphicsSpec
        expect(b({ spec: straddle }, 300, 310.01)).not.toBe(b({ spec: other }, 300, 310.01))
        expect(b({ spec: straddle }, 310.01, 320.02)).not.toBe(b({ spec: other }, 310.01, 320.02))
        expect(b({ spec: straddle }, 320.02, 330.03)).toBe(b({ spec: other }, 320.02, 330.03))
        const bug = (text: string): OverlaySpec => ({ kind: 'scoreBug', cutIndex: 0, startSec: 401, durationSec: 5, label: 'Score bug', fadeIn: true, fadeOut: true, scores: [{ fromSec: 401, bug: { left: 'A', right: 'B', leftColour: '#fff', rightColour: '#000', text } }] })
        const bugged = (text: string): GraphicsSpec => ({ theme: 'shooot', overlays: [bug(text)] }) as unknown as GraphicsSpec
        expect(b({ spec: bugged('1-0') }, 400.4, 410.41)).not.toBe(b({ spec: bugged('2-0') }, 400.4, 410.41))
        expect(b({ spec: bugged('1-0') }, 410.41, 420.42)).toBe(b({ spec: bugged('2-0') }, 410.41, 420.42))
    })
    it('should tie a block that draws a cut-bound caption to the cut edges and the clip before, and no other block', () => {
        const bound = (end: number): { cuts: Cut[]; spec: GraphicsSpec } => ({
            cuts: [{ sourceIndex: 0, startSec: 100, endSec: end }, { sourceIndex: 0, startSec: 900, endSec: 1000 }],
            spec: { theme: 'shooot', overlays: [{ ...caption(0, 303, 'A'), toCutEnd: true, durationSec: end - 303 }] } as unknown as GraphicsSpec,
        })
        const k = (end: number, a: number, z: number): string => buildReuseKeys({ ...blockBase, ...bound(end) }).block(0, a, z)
        // Block 300-310.01 draws the caption that follows the cut's end: moving the end changes it. Block 200-210.01 does not.
        expect(k(306, 300, 310.01)).not.toBe(k(307, 300, 310.01))
        expect(k(306, 200, 210.01)).toBe(k(307, 200, 210.01))
    })
    it('should be a different key from the whole-cut key of the same span', () => {
        expect(b()).not.toBe(buildReuseKeys({ ...blockBase }).cut(0, 200, 210.01))
    })
})

describe('cache cap with prepared units', () => {
    it('should grow to what the preparer admitted, never below the normal cap or past most of the quota', () => {
        expect(capFor(100e9, 14e9)).toBe(14e9)
        expect(capFor(100e9, 2e9)).toBe(cacheCap(100e9))
        expect(capFor(10e9, 40e9)).toBe(9e9)
        expect(capFor(null, 20e9)).toBe(20e9)
        expect(capFor(null, 0)).toBe(CACHE_CAP_BYTES)
    })
})

describe('portable keys (the same piece on another device)', () => {
    const fp = (s: string) => ({ fingerprints: [s] })
    const pk = (o: Partial<typeof base> & { fingerprints?: (string | null)[] } = {}) => buildReuseKeys({ ...base, fingerprints: ['f1'], ...o }).portable!
    it('should not depend on the file\'s modified time (another OS or a copy changes it)', () => {
        const here = pk({ sources: [file('a.mp4', 1000, 5)] })
        const there = pk({ sources: [file('a.mp4', 1000, 999_999)] })
        expect(there.cut(1, 100, 110)).toBe(here.cut(1, 100, 110))
        expect(there.block(1, 100, 110)).toBe(here.block(1, 100, 110))
        expect(there.wholeCut(2)).toBe(here.wholeCut(2))
        // The local key still does.
        expect(k({ sources: [file('a.mp4', 1000, 999_999)] }).cut(1, 100, 110)).not.toBe(cut1())
    })
    it('should change with the footage bytes, name and size', () => {
        const same = pk().block(1, 100, 110)
        expect(pk(fp('f2')).block(1, 100, 110)).not.toBe(same)
        expect(pk({ sources: [file('b.mp4', 1000, 5)] }).block(1, 100, 110)).not.toBe(same)
        expect(pk({ sources: [file('a.mp4', 1001, 5)] }).block(1, 100, 110)).not.toBe(same)
    })
    it('should change with the overlays, quality, bitrate, logo and theme', () => {
        const same = pk().cut(1, 100, 110)
        expect(pk({ spec: { ...base.spec!, overlays: [caption(0, 12, 'A'), caption(1, 102, 'Other')] } as GraphicsSpec }).cut(1, 100, 110)).not.toBe(same)
        expect(pk({ quality: '4k' }).cut(1, 100, 110)).not.toBe(same)
        expect(pk({ videoBitrate: 9e6 }).cut(1, 100, 110)).not.toBe(same)
        expect(pk({ logo: 'abc' }).cut(1, 100, 110)).not.toBe(same)
        expect(pk({ spec: { ...base.spec!, theme: 'other' } as unknown as GraphicsSpec }).cut(1, 100, 110)).not.toBe(same)
    })
    it('should not exist without a fingerprint for every source a cut uses (an unknown footage must never match)', () => {
        expect(buildReuseKeys({ ...base }).portable).toBeUndefined()
        expect(buildReuseKeys({ ...base, fingerprints: [null] }).portable).toBeUndefined()
        expect(buildReuseKeys({ ...base, fingerprints: [] }).portable).toBeUndefined()
    })
    it('should be a different string from the local key', () => {
        expect(pk().cut(1, 100, 110)).not.toBe(cut1())
    })
})

describe('portableKey (engine facts)', () => {
    const facts = { v: 'v1', W: 3840, H: 2160, frameSec: 1 / 30, quality: '4k', bitrate: 20e6, keyFrames: 60, encoder: { hw: 'prefer-hardware', config: { codec: 'avc1.640033' } }, scale: { direct: true, gl: true, canvas: false }, audio: { copyAac: true, codec: 'aac', rate: 48000, channels: 2 } }
    const input = { facts, kind: 'segment', frames: 120, part: { spec: 'p' } }
    it('should ignore the encoder and the scale path', async () => {
        const { portableKey } = await import('./unitCache')
        const same = await portableKey(input)
        expect(same).toMatch(/^[0-9a-f]{32}$/)
        expect(await portableKey({ ...input, facts: { ...facts, encoder: { hw: 'prefer-software', config: { codec: 'avc1.4d0033' } }, scale: { direct: false, gl: false, canvas: true } } })).toBe(same)
    })
    it('should change with RENDER_VERSION, size, rate, bitrate, quality, key interval, audio, frames and the part', async () => {
        const { portableKey } = await import('./unitCache')
        const same = await portableKey(input)
        for (const patch of [{ v: 'v2' }, { W: 1920 }, { H: 1080 }, { frameSec: 1 / 25 }, { bitrate: 10e6 }, { quality: '1080p' }, { keyFrames: 30 }, { audio: null }, { audio: { ...facts.audio, rate: 44100 } }]) {
            expect(await portableKey({ ...input, facts: { ...facts, ...patch } })).not.toBe(same)
        }
        expect(await portableKey({ ...input, frames: 121 })).not.toBe(same)
        expect(await portableKey({ ...input, part: { spec: 'q' } })).not.toBe(same)
        expect(await portableKey({ ...input, kind: 'intro' })).not.toBe(same)
    })
})

describe('footageFingerprint', () => {
    const MiB = 1024 * 1024
    const make = (size: number, patch: Record<number, number> = {}, lastModified = 1, name = 'GX010042.MP4'): File => {
        const b = new Uint8Array(size)
        for (let i = 0; i < size; i += 4096) b[i] = (i / 4096) & 0xff
        for (const [i, v] of Object.entries(patch)) b[Number(i)] = v
        return new File([b], name, { lastModified })
    }
    it('should hash the first and last MiB: same bytes give the same print whatever the modified time', async () => {
        const { footageFingerprint } = await import('./unitCache')
        const a = await footageFingerprint(make(3 * MiB, {}, 1))
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        expect(await footageFingerprint(make(3 * MiB, {}, 2))).toBe(a)
        expect(await footageFingerprint(make(3 * MiB, { 5: 9 }, 3))).not.toBe(a)
        expect(await footageFingerprint(make(3 * MiB, { [3 * MiB - 2]: 9 }, 4))).not.toBe(a)
        // Small files are hashed whole.
        expect(await footageFingerprint(make(1000, {}, 5))).not.toBe(await footageFingerprint(make(1000, { 999: 7 }, 6)))
    })
    it('should read a file once per name, size and modified time in a session', async () => {
        const { footageFingerprint } = await import('./unitCache')
        const f = make(3 * MiB, {}, 77, 'memo.mp4')
        let reads = 0
        const spy = new Proxy(f, { get: (t, p) => (p === 'slice' ? (...a: [number?, number?]) => { reads++; return t.slice(...a) } : Reflect.get(t, p, t)) })
        const one = await footageFingerprint(spy)
        const n = reads
        expect(n).toBeGreaterThan(0)
        expect(await footageFingerprint(spy)).toBe(one)
        expect(reads).toBe(n)
    })
})

describe('eviction with imported parts', () => {
    const e = (key: string, bytes: number, at: number, order = 0) => ({ key, bytes, at, order })
    it('should never drop a pinned (imported, in use) unit, even over the cap', () => {
        const entries = [e('imp1', 100, 0, 0), e('imp2', 100, 0, 1), e('old', 40, 1), e('new', 40, 2)]
        const keep = new Set(entries.map((x) => x.key))
        const drop = planEviction(entries, keep, 50, new Set(['imp1', 'imp2']))
        expect(drop).not.toContain('imp1')
        expect(drop).not.toContain('imp2')
        expect(drop).toEqual(['old', 'new'])
    })
})

describe('importedNote', () => {
    it('should say how many parts came from which device and how many were encoded here', async () => {
        const { importedNote } = await import('./unitCache')
        expect(importedNote(new Map([['iPhone', 4]]), 3)).toBe('Reused 4 parts prepared on iPhone, 3 encoded here')
        expect(importedNote(new Map([['iPhone', 4], ['iPad', 2]]), 0)).toBe('Reused 4 parts prepared on iPhone, 2 on iPad, 0 encoded here')
    })
})
