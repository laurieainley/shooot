import { describe, it, expect } from 'vitest'
import { jobSignature } from './jobSignature'

describe('jobSignature', () => {
    it('should be the same for the same plan regardless of key order', () => {
        expect(jobSignature({ a: 1, b: [1, 2, { c: 'x', d: 2 }] })).toBe(jobSignature({ b: [1, 2, { d: 2, c: 'x' }], a: 1 }))
    })

    it('should change when anything in the plan changes', () => {
        const base = { kind: 'fullMatch', cuts: [{ sourceIndex: 0, startSec: 30, endSec: 100 }], sources: [{ name: 'GX010001.MP4', size: 100 }] }
        const sig = jobSignature(base)
        expect(jobSignature({ ...base, cuts: [{ sourceIndex: 0, startSec: 31, endSec: 100 }] })).not.toBe(sig)
        expect(jobSignature({ ...base, sources: [{ name: 'GX010001.MP4', size: 101 }] })).not.toBe(sig)
        expect(sig).toMatch(/^[0-9a-f]{16}$/)
    })
})
