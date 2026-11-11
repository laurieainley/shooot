import { describe, it, expect } from 'vitest'
import { reencodesFootage } from './graphicsSession'

describe('reencodesFootage', () => {
    it('should re-encode a single HEVC clip so no footage parameter set shares an hvc1 track with the encoder\'s', () => {
        expect(reencodesFootage('clip', true)).toBe(true)
    })

    it('should keep stream copy for H.264 clips and for highlights and full match', () => {
        expect(reencodesFootage('clip', false)).toBe(false)
        expect(reencodesFootage('highlights', true)).toBe(false)
        expect(reencodesFootage('fullMatch', true)).toBe(false)
        expect(reencodesFootage(undefined, true)).toBe(false)
    })
})
