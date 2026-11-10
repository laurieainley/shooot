import { describe, expect, it } from 'vitest'
import { checkUnitJoins, importedLeftOut, takeImportedRestart } from './importedOff'
import { OPENH264_4K_AVCC, VT_4K_AVCC, X264_AVCC, hex } from './nal.fixtures'

const hw = { codec: 'avc1.640033', description: hex(VT_4K_AVCC) }
const sw = { codec: 'avc1.640033', description: hex(OPENH264_4K_AVCC) }
const other = { codec: 'avc1.64001e', description: hex(X264_AVCC) }

describe('parts from another device that this encoder can no longer join', () => {
    it('should fail with a clear message and leave other devices\' parts out of the next attempt (which starts afresh, once)', () => {
        expect(() => checkUnitJoins([sw, hw, null], 2, other, { signature: 's1', importedUsed: true })).toThrow(/Render again: this time every part is encoded here/)
        expect(importedLeftOut('s1')).toBe(true)
        expect(takeImportedRestart('s1')).toBe(true)
        expect(takeImportedRestart('s1')).toBe(false) // later interruptions resume as usual
        expect(importedLeftOut('s1')).toBe(true)
    })
    it('should keep the old failure when no part came from another device', () => {
        expect(() => checkUnitJoins([sw, hw, null], 2, other, { signature: 's2', importedUsed: false })).toThrow(/discard the saved render and start again/)
        expect(importedLeftOut('s2')).toBe(false)
    })
    it('should pass a record that joins', () => {
        expect(() => checkUnitJoins([sw, null], 1, hw, { signature: 's3', importedUsed: true })).not.toThrow()
        expect(importedLeftOut('s3')).toBe(false)
    })
})
