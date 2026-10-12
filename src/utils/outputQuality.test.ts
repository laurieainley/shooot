import { describe, expect, it } from 'vitest'
import { AUDIO_BITRATE, VIDEO_BITRATE, estimateEncodedBytes, qualityOptions, timeHint } from './outputQuality'
import type { CodecSupport } from '../render/transcodeSupport'

const ok: CodecSupport = { decode: true, encode: { '4k': true, '1080p': true } }
const GB = 1024 ** 3
const opts = (over: Partial<Parameters<typeof qualityOptions>[0]> = {}) =>
    qualityOptions({ source: { width: 3840, height: 2160 }, support: ok, seconds: 49 * 60, originalBytes: 30 * GB, ...over })
const byId = (o: ReturnType<typeof opts>, id: string) => o.find((x) => x.id === id)!

describe('qualityOptions', () => {
    it('should offer Original first and enable everything for 4K footage in a capable browser', () => {
        const o = opts()
        expect(o.map((x) => x.id)).toEqual(['original', '4k', '1080p'])
        expect(o.every((x) => !x.disabled)).toBe(true)
    })
    it('should disable 4K, with the reason, for 1080p footage', () => {
        const o = opts({ source: { width: 1920, height: 1080 } })
        expect(byId(o, '4k').disabled).toBe(true)
        expect(byId(o, '4k').reason).toMatch(/1920×1080, not 4K/)
        expect(byId(o, '1080p').disabled).toBe(false)
        expect(byId(o, 'original').disabled).toBe(false)
    })
    it('should disable both re-encodes when the browser cannot decode the footage', () => {
        const o = opts({ support: { decode: false, encode: { '4k': true, '1080p': true } } })
        expect(byId(o, '4k').reason).toMatch(/cannot decode/)
        expect(byId(o, '1080p').disabled).toBe(true)
        expect(byId(o, 'original').disabled).toBe(false)
    })
    it('should disable only the size the browser cannot encode', () => {
        const o = opts({ support: { decode: true, encode: { '4k': false, '1080p': true } } })
        expect(byId(o, '4k').reason).toMatch(/cannot encode 4K/)
        expect(byId(o, '1080p').disabled).toBe(false)
    })
    it('should not disable options while support is still being checked', () => {
        const o = opts({ support: { decode: null, encode: { '4k': null, '1080p': null } } })
        expect(o.every((x) => !x.disabled)).toBe(true)
    })
    it('should disable the re-encodes until footage is loaded', () => {
        const o = opts({ source: null })
        expect(byId(o, '4k').disabled).toBe(true)
        expect(byId(o, 'original').disabled).toBe(false)
    })
})

describe('size and time estimates', () => {
    it('should estimate video plus audio bitrate over the length', () => {
        const seconds = 49 * 60
        expect(estimateEncodedBytes('4k', seconds)).toBeCloseTo(((VIDEO_BITRATE['4k'] + 192_000) / 8) * seconds, -3)
        expect(estimateEncodedBytes('1080p', seconds, 8e6)).toBeCloseTo(((8e6 + 192_000) / 8) * seconds, -3)
    })
    it('should make 1080p smaller than 4K and both smaller than the raw footage', () => {
        const o = opts()
        expect(byId(o, '1080p').bytes).toBeLessThan(byId(o, '4k').bytes)
        expect(byId(o, '4k').bytes).toBeLessThan(byId(o, 'original').bytes)
    })
    it('should put the audio rate for encoded audio at 160 kbps', () => {
        expect(AUDIO_BITRATE).toBe(160_000)
    })
    it('should phrase time relative to the match length', () => {
        expect(timeHint(null)).toBe('quickest')
        expect(timeHint(1)).toBe('about 1× the match length')
        expect(timeHint(0.5)).toBe('about 0.5× the match length')
    })
})
