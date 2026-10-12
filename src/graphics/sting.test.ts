import { describe, it, expect } from 'vitest'
import { STING_SEC, stingFrame } from './layout'
import { isSting } from './types'

describe('stingFrame', () => {
    it('should fade and scale in over 0.6 s, hold, and fade out over the last 0.5 s', () => {
        expect(stingFrame(0, STING_SEC)).toEqual({ alpha: 0, scale: 0.92 })
        expect(stingFrame(0.6, STING_SEC)).toEqual({ alpha: 1, scale: 1 })
        expect(stingFrame(2, STING_SEC)).toEqual({ alpha: 1, scale: 1 })
        expect(stingFrame(STING_SEC, STING_SEC).alpha).toBe(0)
        expect(stingFrame(STING_SEC - 0.25, STING_SEC).alpha).toBeCloseTo(0.5, 5)
    })
})
describe('isSting', () => {
    it('should tell the sting from a card', () => {
        expect(isSting({ kind: 'sting' })).toBe(true)
        expect(isSting(undefined)).toBe(false)
    })
})
