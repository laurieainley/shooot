import { describe, it, expect } from 'vitest'
import { hasInbandParams, planJoin, profileOf } from './joinParams'
import { nalType, paramSets, withInbandParams } from './nal'
import { X264_AVCC, X264_REF1_AVCC, X265_HVCC, VT_HVCC, hex } from './nal.fixtures'

describe('planJoin', () => {
    it('should keep the first source as sample entry when it covers the others', () => {
        const plan = planJoin([hex(X265_HVCC), hex(X265_HVCC)], true)
        expect(plan?.entry).toBe(0)
        expect(plan?.params).toHaveLength(2)
        expect(plan?.params[1].map((n) => nalType(n, true))).toEqual([32, 33, 34])
    })

    it('should choose the SPS that covers every other as sample entry', () => {
        expect(planJoin([hex(X265_HVCC), hex(VT_HVCC)], true)?.entry).toBe(1)
        expect(planJoin([hex(X264_REF1_AVCC), hex(X264_AVCC)], false)?.entry).toBe(1)
    })

    it('should give each source its own parameter sets', () => {
        const plan = planJoin([hex(X265_HVCC), hex(VT_HVCC)], true)!
        expect(plan.params[0]).toEqual(paramSets(hex(X265_HVCC), true))
        expect(plan.params[1]).toEqual(paramSets(hex(VT_HVCC), true))
        expect(plan.params[0]).not.toEqual(plan.params[1])
    })

    it('should return null when a source has no readable parameter sets', () => {
        expect(planJoin([hex(X265_HVCC), undefined], true)).toBeNull()
    })
})

describe('hasInbandParams', () => {
    it('should detect parameter sets already in a sample', () => {
        const slice = new Uint8Array([0, 0, 0, 3, 0x26, 1, 0xaf])
        expect(hasInbandParams(slice, true, 4)).toBe(false)
        expect(hasInbandParams(withInbandParams(slice, paramSets(hex(X265_HVCC), true), true, 4), true, 4)).toBe(true)
    })
})

describe('profileOf', () => {
    it('should read the profile from HEVC and H.264 codec strings', () => {
        expect(profileOf('hvc1.1.6.L120.B0')).toBe('1')
        expect(profileOf('hvc1.2.4.L153.B0')).toBe('2')
        expect(profileOf('avc1.640028')).toBe('64')
        expect(profileOf('avc1.4D401F')).toBe('4d')
    })
})
