import { describe, expect, it } from 'vitest'
import { OUTPUT_COLOR_SPACE, admitsUnit, joinedSample, planEncoderJoin, type UnitVideo } from './encoderJoin'
import { nalType, paramSets, raiseLevel, spsLimits, spsOf } from './nal'
import { OPENH264_4K_AVCC, OPENH264_MAIN_4K_AVCC, VT_4K_AVCC, X264_AVCC, hex } from './nal.fixtures'

const hw: UnitVideo = { codec: 'avc1.640033', description: hex(VT_4K_AVCC) }
const sw: UnitVideo = { codec: 'avc1.640033', description: hex(OPENH264_4K_AVCC) }
const main: UnitVideo = { codec: 'avc1.4d0033', description: hex(OPENH264_MAIN_4K_AVCC) }
const W = 3840
const H = 2160
const dpbOf = (d: AllowSharedBufferSource | undefined): number => spsLimits(spsOf(paramSets(d!, false), false)!, false).dpb
/** A length-prefixed (4-byte) sample of one IDR slice NAL. */
const idr = (): Uint8Array => new Uint8Array([0, 0, 0, 3, 0x65, 0x88, 0x84])

describe('planEncoderJoin', () => {
    it('should leave a single-encoder render as it is: the unit record as entry, nothing in-band', () => {
        const a = { ...hw }
        const plan = planEncoderJoin([a, { ...hw, description: hex(VT_4K_AVCC) }, null, a], W, H)
        expect(plan.entry.description).toBe(a.description)
        expect(plan.entry.codec).toBe('avc1.640033')
        expect(plan.entry).toMatchObject({ codedWidth: W, codedHeight: H })
        expect(plan.inband).toEqual([null, null, null, null])
        expect(plan.mixed).toBe(false)
    })

    it('should label the entry BT.709 limited range (encoders disagree in their VUI)', () => {
        expect(planEncoderJoin([hw], W, H).entry.colorSpace).toEqual(OUTPUT_COLOR_SPACE)
        expect(OUTPUT_COLOR_SPACE).toEqual({ primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false })
    })

    it('should choose the covering hardware SPS as entry when a software unit comes first', () => {
        const plan = planEncoderJoin([sw, sw, hw, sw], W, H)
        expect(plan.mixed).toBe(true)
        expect(dpbOf(plan.entry.description)).toBe(2)
        expect(plan.entry.description).toEqual(hw.description)
    })

    it('should put each unit its own parameter sets in-band when the units differ', () => {
        const plan = planEncoderJoin([sw, hw, null], W, H)
        expect(plan.inband[0]).toEqual(paramSets(sw.description, false))
        expect(plan.inband[1]).toEqual(paramSets(hw.description, false))
        expect(plan.inband[2]).toBeNull()
        expect(plan.lengthSize).toBe(4)
    })

    it('should take a High entry over Main units (decodes in AVFoundation)', () => {
        const plan = planEncoderJoin([main, hw, main], W, H)
        expect(plan.entry.description).toEqual(hw.description)
        expect(plan.entry.codec).toBe('avc1.640033')
    })

    it('should raise the entry level to the highest unit level', () => {
        const sw52: UnitVideo = { codec: 'avc1.640034', description: raiseLevel(sw.description, false, 0x34, 0) }
        const plan = planEncoderJoin([sw52, hw], W, H)
        expect(dpbOf(plan.entry.description)).toBe(2)
        expect(plan.entry.codec).toBe('avc1.640034')
        expect(spsLimits(spsOf(paramSets(plan.entry.description!, false), false)!, false).level).toBe(0x34)
    })

    it('should refuse units no single entry covers', () => {
        expect(() => planEncoderJoin([sw, { codec: 'avc1.64001e', description: hex(X264_AVCC) }], W, H)).toThrow(/different encoders/)
    })
})

describe('admitsUnit', () => {
    it('should admit a unit identical to one already in the render', () => {
        expect(admitsUnit([hw], { ...hw, description: hex(VT_4K_AVCC) })).toBe(true)
    })

    it('should admit a unit from another encoder that one entry still covers, in either order', () => {
        expect(admitsUnit([hw], sw)).toBe(true)
        expect(admitsUnit([sw], hw)).toBe(true)
        expect(admitsUnit([hw, sw], main)).toBe(true)
    })

    it('should refuse a unit whose SPS no entry covers together with the others', () => {
        expect(admitsUnit([sw], { codec: 'avc1.64001e', description: hex(X264_AVCC) })).toBe(false)
        // Only High over Main was checked in AVFoundation: Baseline and Main units have no entry that covers both.
        expect(admitsUnit([main], { codec: 'avc1.420033', description: patchProfile(main.description, 66) })).toBe(false)
    })

    it('should refuse a unit with another NAL length size', () => {
        const two = sw.description.slice()
        two[4] = 0xfd // lengthSizeMinusOne = 1
        expect(admitsUnit([hw], { codec: sw.codec, description: two })).toBe(false)
    })

    it('should refuse a unit without readable parameter sets', () => {
        expect(admitsUnit([hw], { codec: 'avc1.640033', description: new Uint8Array([1, 2, 3]) })).toBe(false)
    })
})

describe('joinedSample', () => {
    it('should pass samples through untouched when the unit has nothing in-band', () => {
        const d = idr()
        expect(joinedSample(d, true, null, 4)).toBe(d)
    })

    it('should prepend the unit parameter sets to its key frames only', () => {
        const ps = paramSets(sw.description, false)
        const out = joinedSample(idr(), true, ps, 4)
        const types: number[] = []
        for (let o = 0; o < out.length;) { const len = (out[o] << 24) | (out[o + 1] << 16) | (out[o + 2] << 8) | out[o + 3]; types.push(nalType(out.subarray(o + 4), false)); o += 4 + len }
        expect(types).toEqual([7, 8, 5])
        const delta = new Uint8Array([0, 0, 0, 2, 0x41, 0x9a])
        expect(joinedSample(delta, false, ps, 4)).toBe(delta)
    })

    it('should not add the sets twice to a sample that already carries them', () => {
        const ps = paramSets(sw.description, false)
        const once = joinedSample(idr(), true, ps, 4)
        expect(joinedSample(once, true, ps, 4)).toBe(once)
    })
})

/** A copy of an avcC with its SPS profile_idc changed (an encoder of another profile). */
function patchProfile(desc: Uint8Array, profile: number): Uint8Array {
    const d = desc.slice()
    d[1] = profile
    d[9] = profile // SPS: avcC header 6 bytes + 2-byte length + NAL header, then profile_idc
    return d
}
