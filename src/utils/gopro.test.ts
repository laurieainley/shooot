import { describe, it, expect } from 'vitest'
import { parseGoProName } from './gopro'

describe('parseGoProName', () => {
    it('should parse an HEVC full file', () => {
        expect(parseGoProName('GX010226.MP4')).toEqual({ key: '010226', chapter: 1, kind: 'full' })
    })

    it('should parse an H.264 full file', () => {
        expect(parseGoProName('GH030012.MP4')).toEqual({ key: '030012', chapter: 3, kind: 'full' })
    })

    it('should parse an LRV proxy', () => {
        expect(parseGoProName('GL010226.LRV')).toEqual({ key: '010226', chapter: 1, kind: 'proxy' })
    })

    it('should be case-insensitive', () => {
        expect(parseGoProName('gl020238.lrv')).toEqual({ key: '020238', chapter: 2, kind: 'proxy' })
    })

    it('should return null for non-GoPro names', () => {
        expect(parseGoProName('match.mp4')).toBeNull()
        expect(parseGoProName('GX010226.THM')).toBeNull()
        expect(parseGoProName('GL010226.MP4')).toBeNull()
    })
})
