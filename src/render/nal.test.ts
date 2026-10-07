import { describe, it, expect } from 'vitest'
import { unescape, codecWithLevel, covers, maxBitrateForLevel, craToBla, lengthSize, nalType, paramSets, pickSampleEntry, raiseLevel, spsLimits, withInbandParams } from './nal'
import { GOPRO4K_HVCC, X264_AVCC, X264_REF1_AVCC, X265_HVCC, VT_AVCC, VT_HVCC, hex } from './nal.fixtures'

const sps = (desc: string, hevc: boolean): Uint8Array => paramSets(hex(desc), hevc).find((n) => nalType(n, hevc) === (hevc ? 33 : 7))!

describe('paramSets', () => {
    it('should return VPS, SPS and PPS from an hvcC, dropping the encoder SEI', () => {
        const ps = paramSets(hex(X265_HVCC), true)
        expect(ps.map((n) => nalType(n, true))).toEqual([32, 33, 34])
    })

    it('should return SPS and PPS from an avcC', () => {
        const ps = paramSets(hex(X264_AVCC), false)
        expect(ps.map((n) => nalType(n, false))).toEqual([7, 8])
        expect(ps[0][0]).toBe(0x67)
    })
})

describe('lengthSize', () => {
    it('should read the NAL length size from both record kinds', () => {
        expect(lengthSize(hex(X265_HVCC), true)).toBe(4)
        expect(lengthSize(hex(X264_AVCC), false)).toBe(4)
    })
})

describe('spsLimits', () => {
    it('should read coded size and DPB from HEVC SPS', () => {
        expect(spsLimits(sps(X265_HVCC, true), true)).toMatchObject({ codedWidth: 1920, codedHeight: 1080, dpb: 5 })
        expect(spsLimits(sps(VT_HVCC, true), true)).toMatchObject({ codedWidth: 1920, codedHeight: 1088, dpb: 5 })
    })

    it('should read coded size and reference frames from H.264 SPS', () => {
        expect(spsLimits(sps(X264_AVCC, false), false)).toMatchObject({ codedWidth: 768, codedHeight: 432, dpb: 4 })
        expect(spsLimits(sps(X264_REF1_AVCC, false), false)).toMatchObject({ dpb: 1 })
        expect(spsLimits(sps(VT_AVCC, false), false)).toMatchObject({ codedWidth: 768, codedHeight: 432, dpb: 2 })
    })
})

const P = { profile: 1, profileSpace: 0, tier: 0 }

describe('covers / pickSampleEntry', () => {
    const lim = (desc: string, hevc: boolean) => spsLimits(sps(desc, hevc), hevc)

    it('should pick the HEVC card entry (1088 rows) over 1080-row footage', () => {
        expect(covers(lim(VT_HVCC, true), lim(X265_HVCC, true))).toBe(true)
        expect(covers(lim(X265_HVCC, true), lim(VT_HVCC, true))).toBe(false)
        expect(pickSampleEntry([lim(X265_HVCC, true), lim(VT_HVCC, true)])).toBe(1)
    })

    it('should keep the footage entry when it has more reference frames', () => {
        expect(pickSampleEntry([lim(X264_AVCC, false), lim(VT_AVCC, false)])).toBe(0)
    })

    it('should pick the card entry when footage has a single reference frame', () => {
        expect(pickSampleEntry([lim(X264_REF1_AVCC, false), lim(VT_AVCC, false)])).toBe(1)
    })

    it('should prefer the first entry when several cover the rest', () => {
        const a = { ...P, codedWidth: 1920, codedHeight: 1088, dpb: 5, level: 120 }
        expect(pickSampleEntry([a, { ...a }])).toBe(0)
    })

    it('should return -1 when no entry covers all others', () => {
        const tall = { ...P, codedWidth: 1920, codedHeight: 1088, dpb: 2, level: 120 }
        const deep = { ...P, codedWidth: 1920, codedHeight: 1080, dpb: 4, level: 120 }
        expect(pickSampleEntry([tall, deep])).toBe(-1)
    })
})

describe('withInbandParams', () => {
    const lp = (n: Uint8Array, ls = 4): number[] => [...Array.from({ length: ls }, (_, i) => (n.length >> (8 * (ls - 1 - i))) & 255), ...n]

    it('should prepend length-prefixed parameter sets', () => {
        const slice = new Uint8Array([0x26, 0x01, 0xaa])
        const vps = new Uint8Array([0x40, 0x01, 1])
        const spsN = new Uint8Array([0x42, 0x01, 2, 2])
        const out = withInbandParams(new Uint8Array(lp(slice)), [vps, spsN], true, 4)
        expect([...out]).toEqual([...lp(vps), ...lp(spsN), ...lp(slice)])
    })

    it('should insert after a leading access unit delimiter', () => {
        const aud = new Uint8Array([0x46, 0x01, 0x10])
        const slice = new Uint8Array([0x26, 0x01, 0xaa])
        const p = new Uint8Array([0x44, 0x01, 9])
        const out = withInbandParams(new Uint8Array([...lp(aud), ...lp(slice)]), [p], true, 4)
        expect([...out]).toEqual([...lp(aud), ...lp(p), ...lp(slice)])
    })

    it('should handle H.264 and 2-byte lengths', () => {
        const aud = new Uint8Array([0x09, 0xf0])
        const idr = new Uint8Array([0x65, 0x88])
        const s = new Uint8Array([0x67, 1, 2])
        const out = withInbandParams(new Uint8Array([...lp(aud, 2), ...lp(idr, 2)]), [s], false, 2)
        expect([...out]).toEqual([...lp(aud, 2), ...lp(s, 2), ...lp(idr, 2)])
    })
})

describe('craToBla', () => {
    const lp = (n: number[]): number[] => [0, 0, 0, n.length, ...n]

    it('should turn every CRA slice into BLA_N_LP and leave other NAL units alone', () => {
        const vps = [0x40, 0x01, 7]
        const cra = [21 << 1, 0x01, 0xaf, 0x00]
        const out = craToBla(new Uint8Array([...lp(vps), ...lp(cra), ...lp(cra)]), 4)
        expect(out).not.toBeNull()
        const types = [out![4], out![4 + 3 + 4], out![4 + 3 + 4 + 4 + 4]].map((b) => (b >> 1) & 63)
        expect(types).toEqual([32, 18, 18])
        // layer id / temporal id bits kept
        expect(out![4 + 3 + 4 + 1]).toBe(0x01)
    })

    it('should return null for IDR and trailing pictures', () => {
        expect(craToBla(new Uint8Array(lp([19 << 1, 0x01, 0xaf])), 4)).toBeNull()
        expect(craToBla(new Uint8Array(lp([1 << 1, 0x01, 0xaf])), 4)).toBeNull()
    })

    it('should not modify the input sample', () => {
        const src = new Uint8Array(lp([21 << 1, 0x01, 0xaf]))
        craToBla(src, 4)
        expect((src[4] >> 1) & 63).toBe(21)
    })
})

describe('profile, tier and level', () => {
    const lim = (desc: string, hevc: boolean) => spsLimits(sps(desc, hevc), hevc)

    it('should read profile, tier and level from HEVC and H.264 SPS', () => {
        expect(lim(X265_HVCC, true)).toMatchObject({ profile: 1, profileSpace: 0, tier: 0, level: 120 })
        expect(lim(VT_HVCC, true)).toMatchObject({ profile: 1, tier: 0, level: 120 })
        expect(lim(GOPRO4K_HVCC, true)).toMatchObject({ codedWidth: 3840, codedHeight: 2160, profile: 1, tier: 0, level: 180 })
        expect(lim(X264_AVCC, false)).toMatchObject({ profile: 100, level: 30 })
    })

    it('should not let a lower level cover a higher one', () => {
        const footage = { ...P, codedWidth: 3840, codedHeight: 2160, dpb: 5, level: 180 }
        const card = { ...footage, codedHeight: 2176, level: 150 }
        expect(covers(card, footage)).toBe(false)
        expect(covers({ ...footage, level: 150 }, footage)).toBe(false)
        expect(covers({ ...footage, level: 183 }, footage)).toBe(true)
    })

    it('should not let a lower tier or another profile cover', () => {
        const a = { ...P, codedWidth: 1920, codedHeight: 1080, dpb: 4, level: 120 }
        expect(covers(a, { ...a, tier: 1 })).toBe(false)
        expect(covers({ ...a, tier: 1 }, a)).toBe(true)
        expect(covers(a, { ...a, profile: 2 })).toBe(false)
        expect(covers({ ...a, profile: 2 }, a)).toBe(false)
    })

    it('should pick the card entry for 4K footage whose level is higher, to be raised afterwards', () => {
        const footage = lim(GOPRO4K_HVCC, true)
        const card = { ...footage, codedHeight: 2176, level: 150 }
        expect(pickSampleEntry([footage, card])).toBe(1)
    })

    it('should find no entry for footage and a card of different profiles', () => {
        const a = { ...P, codedWidth: 1920, codedHeight: 1088, dpb: 4, level: 120 }
        expect(pickSampleEntry([a, { ...a, profile: 2 }])).toBe(-1)
    })
})

describe('raiseLevel', () => {
    const lim = (desc: Uint8Array, hevc: boolean) => spsLimits(paramSets(desc, hevc).find((n) => nalType(n, hevc) === (hevc ? 33 : 7))!, hevc)

    it('should raise the level in the hvcC header and in the VPS and SPS, leaving everything else', () => {
        const src = hex(VT_HVCC)
        const out = raiseLevel(src, true, 180, 0)
        expect(out[12]).toBe(180)
        expect(lim(out, true)).toMatchObject({ level: 180, codedWidth: 1920, codedHeight: 1088, dpb: 5 })
        const vps = paramSets(out, true)[0]
        expect(unescape(vps)[17]).toBe(180)
        expect(paramSets(out, true)).toHaveLength(3)
        expect(paramSets(out, true)[2]).toEqual(paramSets(src, true)[2])
        expect(out.length).toBe(src.length)
    })

    it('should keep the x265 SEI array and raise the level of a real 4K level 6 record unchanged when already enough', () => {
        expect(raiseLevel(hex(GOPRO4K_HVCC), true, 180, 0)).toEqual(hex(GOPRO4K_HVCC))
        expect(raiseLevel(hex(GOPRO4K_HVCC), true, 120, 0)).toEqual(hex(GOPRO4K_HVCC))
        const out = raiseLevel(hex(X265_HVCC), true, 150, 0)
        expect(out[12]).toBe(150)
        expect(lim(out, true)).toMatchObject({ level: 150, codedWidth: 1920 })
    })

    it('should set the tier flag in the header and the SPS', () => {
        const out = raiseLevel(hex(VT_HVCC), true, 150, 1)
        expect(out[1] & 0x20).toBe(0x20)
        expect(lim(out, true)).toMatchObject({ tier: 1, level: 150, profile: 1 })
    })

    it('should survive an SPS whose profile bytes need emulation prevention', () => {
        // Level 3 (0x03) in the PTL forces an escape after the zero constraint flags; round trip must stay parseable.
        const low = raiseLevel(hex(VT_HVCC), true, 3, 0)
        expect(low).toEqual(hex(VT_HVCC)) // never lowers
        const out = raiseLevel(hex(X265_HVCC), true, 186, 0)
        expect(lim(out, true)).toMatchObject({ level: 186, codedWidth: 1920, codedHeight: 1080 })
    })

    it('should raise the level in the avcC header and SPS', () => {
        const out = raiseLevel(hex(X264_AVCC), false, 51, 0)
        expect(out[3]).toBe(51)
        expect(lim(out, false)).toMatchObject({ level: 51, profile: 100, codedWidth: 768, dpb: 4 })
        expect(paramSets(out, false).map((n) => nalType(n, false))).toEqual([7, 8])
        expect(out.slice(out.length - 4)).toEqual(hex(X264_AVCC).slice(hex(X264_AVCC).length - 4))
    })
})

describe('codecWithLevel', () => {
    it('should rewrite the level of HEVC and H.264 codec strings', () => {
        expect(codecWithLevel('hvc1.1.6.L150.B0', true, 180, 0)).toBe('hvc1.1.6.L180.B0')
        expect(codecWithLevel('hvc1.1.6.L120.90', true, 150, 1)).toBe('hvc1.1.6.H150.90')
        expect(codecWithLevel('avc1.640028', false, 51, 0)).toBe('avc1.640033')
        expect(codecWithLevel('vp09.00.10.08', false, 51, 0)).toBe('vp09.00.10.08')
    })
})

describe('maxBitrateForLevel', () => {
    it('should give the HEVC Main tier limit for the level byte (level × 30)', () => {
        expect(maxBitrateForLevel({ level: 180, tier: 0 }, true)).toBe(60e6) // 6.0: GoPro 4K
        expect(maxBitrateForLevel({ level: 153, tier: 0 }, true)).toBe(40e6) // 5.1: GoPro 1080p
        expect(maxBitrateForLevel({ level: 183, tier: 0 }, true)).toBe(120e6)
    })

    it('should give the HEVC High tier limit', () => {
        expect(maxBitrateForLevel({ level: 180, tier: 1 }, true)).toBe(240e6)
    })

    it('should give the H.264 limit for level_idc (level × 10)', () => {
        expect(maxBitrateForLevel({ level: 42, tier: 0 }, false)).toBe(50e6)
        expect(maxBitrateForLevel({ level: 51, tier: 0 }, false)).toBe(240e6)
    })

    it('should not cap an unknown level', () => {
        expect(maxBitrateForLevel({ level: 0, tier: 0 }, true)).toBe(Infinity)
        expect(maxBitrateForLevel({ level: 255, tier: 0 }, false)).toBe(Infinity)
    })
})
