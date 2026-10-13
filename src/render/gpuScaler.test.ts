import { describe, expect, it } from 'vitest'
import { gpuUnavailableReason } from './gpuScaler'

describe('gpuUnavailableReason', () => {
    it('should say why when navigator.gpu is missing', () => {
        expect(gpuUnavailableReason({}, true)).toMatch(/navigator\.gpu/)
        expect(gpuUnavailableReason(undefined, true)).toMatch(/navigator\.gpu/)
    })
    it('should need OffscreenCanvas', () => {
        expect(gpuUnavailableReason({ gpu: {} }, false)).toMatch(/OffscreenCanvas/)
    })
    it('should accept a browser with both', () => {
        expect(gpuUnavailableReason({ gpu: {} }, true)).toBeNull()
    })
})
