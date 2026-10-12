import { describe, it, expect, vi } from 'vitest'
import { STING_SEC, stingFrame } from './layout'
import { isSting } from './types'
import { paintSting } from './sting'
import type { Ctx } from './paint'

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

describe('paintSting', () => {
    const ctx = { canvas: { width: 100, height: 56 }, fillRect: () => undefined, drawImage: () => undefined } as unknown as Ctx
    it('should throw when the wordmark is missing so the sting is reported as skipped, not applied blank', () => {
        expect(() => paintSting(ctx, 1, 3.5, { logo: null, wordmark: null })).toThrow(/wordmark/)
        expect(() => paintSting(ctx, 1, 3.5, { logo: null })).toThrow(/wordmark/)
    })
    it('should draw the wordmark when there is one', () => {
        const draw = vi.fn()
        const c = { ...ctx, drawImage: draw } as unknown as Ctx
        paintSting(c, 1, 3.5, { logo: null, wordmark: { width: 200, height: 50 } as ImageBitmap })
        expect(draw).toHaveBeenCalled()
    })
})
