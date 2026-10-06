import { describe, it, expect } from 'vitest'
import { codecStringVariants } from './codecSupport'

describe('codecStringVariants', () => {
    it('should offer both HEVC sample-entry spellings (Safari only answers for hvc1, GoPro reports hev1)', () => {
        expect(codecStringVariants('hev1.1.6.L153.B0')).toEqual(['hev1.1.6.L153.B0', 'hvc1.1.6.L153.B0'])
        expect(codecStringVariants('hvc1.1.6.L93.B0')).toEqual(['hvc1.1.6.L93.B0', 'hev1.1.6.L93.B0'])
    })

    it('should offer both H.264 spellings', () => {
        expect(codecStringVariants('avc1.64002a')).toEqual(['avc1.64002a', 'avc3.64002a'])
    })

    it('should leave other codec strings alone', () => {
        expect(codecStringVariants('av01.0.08M.08')).toEqual(['av01.0.08M.08'])
    })
})
