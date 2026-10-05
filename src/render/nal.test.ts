import { describe, it, expect } from 'vitest'
import { covers, craToBla, lengthSize, nalType, paramSets, pickSampleEntry, spsLimits, withInbandParams } from './nal'
import { X264_AVCC, X264_REF1_AVCC, X265_HVCC, VT_AVCC, VT_HVCC, hex } from './nal.fixtures'

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
        const a = { codedWidth: 1920, codedHeight: 1088, dpb: 5, level: 120 }
        expect(pickSampleEntry([a, { ...a }])).toBe(0)
    })

    it('should return -1 when no entry covers all others', () => {
        const tall = { codedWidth: 1920, codedHeight: 1088, dpb: 2, level: 120 }
        const deep = { codedWidth: 1920, codedHeight: 1080, dpb: 4, level: 120 }
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
