import { describe, it, expect } from 'vitest'
import { fileKey } from './fileKey'

describe('fileKey', () => {
    it('should use the file name', () => {
        expect(fileKey('match-1.mp4')).toBe('match-1.mp4')
    })
})

describe('fileKey (GoPro)', () => {
    it('should give an LRV proxy and its full MP4 the same key', () => {
        expect(fileKey('GL010226.LRV')).toBe(fileKey('GX010226.MP4'))
    })

    it('should keep chapters of one recording apart', () => {
        expect(fileKey('GX010226.MP4')).not.toBe(fileKey('GX020226.MP4'))
    })
})
