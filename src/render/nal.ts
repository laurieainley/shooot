// Byte-level helpers for splicing generated video into stream-copied H.264/HEVC (see the title-card spike:
// docs/superpowers/specs/2026-10-05-title-cards-spike.md). Samples are length-prefixed NAL units (avcC/hvcC).

export type SpsLimits = { codedWidth: number; codedHeight: number; dpb: number; level: number }

export const toU8 = (d: AllowSharedBufferSource): Uint8Array =>
    d instanceof Uint8Array ? d : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d as ArrayBuffer)

export function nalType(nal: Uint8Array, hevc: boolean): number {
    return hevc ? (nal[0] >> 1) & 63 : nal[0] & 31
}

/** NAL length-field size (1, 2 or 4 bytes) declared by an avcC / hvcC record. */
export function lengthSize(desc: AllowSharedBufferSource, hevc: boolean): number {
    return (toU8(desc)[hevc ? 21 : 4] & 3) + 1
}

const PARAM_TYPES = { hevc: [32, 33, 34], avc: [7, 8] }
export const SPS_TYPE = { hevc: 33, avc: 7 }

/** VPS/SPS/PPS NAL units from an avcC / hvcC record (any SEI arrays, e.g. x265's 2 KB info SEI, are left out). */
export function paramSets(desc: AllowSharedBufferSource, hevc: boolean): Uint8Array[] {
    const b = toU8(desc)
    const out: Uint8Array[] = []
    const u16 = (i: number): number => (b[i] << 8) | b[i + 1]
    if (hevc) {
        let o = 23
        for (let a = 0, na = b[22]; a < na; a++) {
            const n = u16(o + 1)
            o += 3
            for (let k = 0; k < n; k++) {
                const len = u16(o)
                out.push(b.subarray(o + 2, o + 2 + len))
                o += 2 + len
            }
        }
    } else {
        let o = 6
        for (let k = 0, n = b[5] & 31; k < n; k++) { const len = u16(o); out.push(b.subarray(o + 2, o + 2 + len)); o += 2 + len }
        for (let k = 0, n = b[o++]; k < n; k++) { const len = u16(o); out.push(b.subarray(o + 2, o + 2 + len)); o += 2 + len }
    }
    const keep = hevc ? PARAM_TYPES.hevc : PARAM_TYPES.avc
    return out.filter((n) => keep.includes(nalType(n, hevc)))
}

/** The SPS among a record's parameter sets. */
export function spsOf(params: Uint8Array[], hevc: boolean): Uint8Array | undefined {
    return params.find((n) => nalType(n, hevc) === (hevc ? SPS_TYPE.hevc : SPS_TYPE.avc))
}

class Bits {
    private bit = 0
    private readonly b: Uint8Array
    constructor(b: Uint8Array) { this.b = b }
    u(n: number): number {
        let v = 0
        for (let i = 0; i < n; i++, this.bit++) v = v * 2 + ((this.b[this.bit >> 3] >> (7 - (this.bit & 7))) & 1)
        return v
    }
    ue(): number {
        let z = 0
        while (this.u(1) === 0 && z < 32) z++
        return 2 ** z - 1 + this.u(z)
    }
    se(): number {
        const k = this.ue()
        return k & 1 ? (k + 1) / 2 : -k / 2
    }
}

function unescape(nal: Uint8Array): Uint8Array {
    const out: number[] = []
    for (let i = 0; i < nal.length; i++) {
        if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue
        out.push(nal[i])
    }
    return new Uint8Array(out)
}

/** What a decoder session sized from this SPS must hold: coded size and reference-picture buffer. */
export function spsLimits(sps: Uint8Array, hevc: boolean): SpsLimits {
    const r = new Bits(unescape(sps))
    if (hevc) {
        r.u(16) // NAL header
        r.u(4)
        const maxSub = r.u(3)
        r.u(1)
        r.u(88)
        const level = r.u(8)
        const prof: boolean[] = []
        const lvl: boolean[] = []
        for (let i = 0; i < maxSub; i++) { prof.push(!!r.u(1)); lvl.push(!!r.u(1)) }
        if (maxSub > 0) for (let i = maxSub; i < 8; i++) r.u(2)
        for (let i = 0; i < maxSub; i++) { if (prof[i]) r.u(88); if (lvl[i]) r.u(8) }
        r.ue()
        if (r.ue() === 3) r.u(1)
        const codedWidth = r.ue()
        const codedHeight = r.ue()
        if (r.u(1)) { r.ue(); r.ue(); r.ue(); r.ue() }
        r.ue(); r.ue(); r.ue()
        const all = r.u(1)
        let dpb = 0
        for (let i = all ? 0 : maxSub; i <= maxSub; i++) { dpb = r.ue() + 1; r.ue(); r.ue() }
        return { codedWidth, codedHeight, dpb, level }
    }
    r.u(8)
    const profile = r.u(8)
    r.u(8)
    const level = r.u(8)
    r.ue()
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
        const chroma = r.ue()
        if (chroma === 3) r.u(1)
        r.ue(); r.ue(); r.u(1)
        if (r.u(1)) {
            for (let i = 0; i < (chroma === 3 ? 12 : 8); i++) {
                if (!r.u(1)) continue
                let last = 8
                let next = 8
                for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
                    if (next !== 0) next = (last + r.se() + 256) % 256
                    last = next === 0 ? last : next
                }
            }
        }
    }
    r.ue()
    const poc = r.ue()
    if (poc === 0) r.ue()
    else if (poc === 1) { r.u(1); r.se(); r.se(); const n = r.ue(); for (let i = 0; i < n; i++) r.se() }
    const dpb = r.ue()
    r.u(1)
    const w = r.ue() + 1
    const h = r.ue() + 1
    const frameMbsOnly = r.u(1)
    return { codedWidth: w * 16, codedHeight: h * 16 * (2 - frameMbsOnly), dpb, level }
}

/** True when a decoder sized for `a` can also decode `b` (AVFoundation sizes its session from the sample entry). */
export function covers(a: SpsLimits, b: SpsLimits): boolean {
    return a.codedWidth >= b.codedWidth && a.codedHeight >= b.codedHeight && a.dpb >= b.dpb
}

/** Index of the first SPS that covers all the others (the one to put in the MP4 sample entry), or -1. */
export function pickSampleEntry(limits: SpsLimits[]): number {
    return limits.findIndex((a) => limits.every((b) => covers(a, b)))
}

const readLen = (data: Uint8Array, at: number, ls: number): number => {
    let len = 0
    for (let i = 0; i < ls; i++) len = len * 256 + data[at + i]
    return len
}

/** Prepends parameter-set NAL units (length-prefixed) to a sample, after a leading access unit delimiter if any. */
export function withInbandParams(data: Uint8Array, params: Uint8Array[], hevc: boolean, ls: number): Uint8Array {
    let audEnd = 0
    if (data.length > ls && nalType(data.subarray(ls), hevc) === (hevc ? 35 : 9)) audEnd = ls + readLen(data, 0, ls)
    const extra = params.reduce((a, p) => a + ls + p.length, 0)
    const out = new Uint8Array(data.length + extra)
    out.set(data.subarray(0, audEnd), 0)
    let o = audEnd
    for (const p of params) {
        for (let i = 0; i < ls; i++) out[o + i] = (p.length >> (8 * (ls - 1 - i))) & 255
        out.set(p, o + ls)
        o += ls + p.length
    }
    out.set(data.subarray(audEnd), o)
    return out
}

const HEVC_CRA = 21
const HEVC_BLA_N_LP = 18

/**
 * HEVC splice point: a CRA picture whose leading pictures were dropped becomes a BLA_N_LP picture, so decoders
 * start a new coded video sequence there (POC restarts; a new SPS may activate) instead of continuing the
 * previous clip's. Returns a modified copy, or null when the sample has no CRA slice.
 */
export function craToBla(data: Uint8Array, ls: number): Uint8Array | null {
    let out: Uint8Array | null = null
    for (let o = 0; o + ls < data.length;) {
        const len = readLen(data, o, ls)
        const h = o + ls
        if (len > 0 && h < data.length && ((data[h] >> 1) & 63) === HEVC_CRA) {
            out ??= data.slice()
            out[h] = (out[h] & 0x81) | (HEVC_BLA_N_LP << 1)
        }
        o = h + len
    }
    return out
}
