import { describe, expect, it } from 'vitest'
import { AUDIO_BITRATE, VIDEO_BITRATE, estimateEncodedBytes, applyStorageFit, qualityOptions, resolveHighlightsQuality, timeHint } from './outputQuality'
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
    it('should give an honest range of minutes for a re-encode', () => {
        expect(timeHint(null, 2940)).toBe('quickest')
        expect(timeHint([0.65, 1.1], 49 * 60)).toBe('roughly 30–55 min for a 49 min match, depending on the device')
        expect(timeHint([0.8, 1.3], 49 * 60)).toBe('roughly 40–65 min for a 49 min match, depending on the device')
        expect(timeHint([0.8, 1.3], 30)).toBe('under a minute')
    })
})

describe('applyStorageFit', () => {
    const room = (freeGb: number, quotaGb = freeGb) => ({ quota: quotaGb * 1e9, free: freeGb * 1e9 })
    it('should grey out Original, with the numbers, when the quota is a Pixel-sized 10.8 GB', () => {
        const r = applyStorageFit(opts(), room(10.8), 'original')
        expect(byId(r.options, 'original').disabled).toBe(true)
        expect(byId(r.options, 'original').noRoom).toBe(true)
        expect(byId(r.options, 'original').reason).toMatch(/Too big for this browser’s storage \(about 32.2 GB needed, 10.8 GB available\)/)
        expect(byId(r.options, '4k').disabled).toBe(false)
        expect(byId(r.options, '1080p').disabled).toBe(false)
    })
    it('should switch a chosen option that does not fit to the largest one that does, and say so', () => {
        const r = applyStorageFit(opts(), room(10.8), 'original')
        expect(r.effective).toBe('4k')
        expect(r.note).toMatch(/Original would not fit.*4K is selected/)
    })
    it('should keep a choice that fits, without a note', () => {
        const r = applyStorageFit(opts(), room(10.8), '1080p')
        expect(r.effective).toBe('1080p')
        expect(r.note).toBeNull()
    })
    it('should apply a 10% margin', () => {
        const need = byId(opts(), '4k').bytes
        expect(byId(applyStorageFit(opts(), { quota: 1e12, free: need * 1.05 }, '4k').options, '4k').disabled).toBe(true)
        expect(byId(applyStorageFit(opts(), { quota: 1e12, free: need * 1.12 }, '4k').options, '4k').disabled).toBe(false)
    })
    it('should fall to 1080p when only that fits', () => {
        const r = applyStorageFit(opts(), room(5), 'original')
        expect(r.effective).toBe('1080p')
        expect(byId(r.options, '4k').disabled).toBe(true)
    })
    it('should block nothing, and warn, when nothing fits', () => {
        const r = applyStorageFit(opts(), room(1), 'original')
        expect(r.options.every((o) => !o.disabled)).toBe(true)
        expect(r.effective).toBe('original')
        expect(r.note).toMatch(/may not fit/)
    })
    it('should block nothing when the browser gives no estimate', () => {
        const r = applyStorageFit(opts(), null, '4k')
        expect(r.options.every((o) => !o.disabled)).toBe(true)
        expect(r.effective).toBe('4k')
        expect(r.note).toBeNull()
        expect(r.privateHint).toBe(false)
    })
    it('should flag a private-window sized quota', () => {
        expect(applyStorageFit(opts(), room(1.5), 'original').privateHint).toBe(true)
        expect(applyStorageFit(opts(), room(10.8), 'original').privateHint).toBe(false)
    })
    it('should not blame storage when the choice was lost to the footage', () => {
        const r = applyStorageFit(opts({ source: { width: 1920, height: 1080 }, originalBytes: 3 * GB }), room(50), '4k')
        expect(r.effective).toBe('original')
        expect(r.note).toBeNull()
    })
})

describe('resolveHighlightsQuality', () => {
    it('should default to Original off a phone and 1080p on one, until the user chooses', () => {
        expect(resolveHighlightsQuality('auto', false)).toBe('original')
        expect(resolveHighlightsQuality(undefined, false)).toBe('original')
        expect(resolveHighlightsQuality('auto', true)).toBe('1080p')
    })
    it('should keep an explicit choice on every device', () => {
        expect(resolveHighlightsQuality('original', true)).toBe('original')
        expect(resolveHighlightsQuality('4k', false)).toBe('4k')
    })
})

describe('highlights time hints', () => {
    it('should name the reel and give Original a time when it is not a plain copy', () => {
        expect(timeHint([0.4, 0.6], 6 * 60, 'reel')).toBe('roughly 2–4 min for a 6 min reel, depending on the device')
        const o = qualityOptions({ source: { width: 3840, height: 2160 }, support: { decode: true, encode: { '4k': true, '1080p': true } }, seconds: 360, originalBytes: 1e9, time: (q) => ({ seconds: q === 'original' ? 720 : 400, low: q === 'original' ? 648 : 360, high: q === 'original' ? 864 : 460, basis: 'typical' }) })
        expect(o[0].timeRange).toEqual([1.8, 2.4])
        expect(o[0].timeBasis).toBe('typical')
        expect(qualityOptions({ source: null, support: { decode: true, encode: { '4k': true, '1080p': true } }, seconds: 360, originalBytes: 1e9 })[0].timeRange).toBeNull()
        expect(timeHint([1, 1.2], 600, 'reel', 'this device')).toBe('roughly 10–12 min for a 10 min reel, going by your last renders')
    })
})

describe('saveToFileQuality', () => {
    const opt = (id: 'original' | '4k' | '1080p', extra: object = {}) => ({ id, label: id, disabled: false, reason: null, bytes: 1, timeRange: null, ...extra }) as QualityOption
    it('should keep the chosen quality when only storage rules it out', () => {
        expect(saveToFileQuality([opt('original', { disabled: true, noRoom: true }), opt('4k'), opt('1080p')], 'original', '1080p')).toBe('original')
    })
    it('should fall back when the footage or browser rules it out', () => {
        expect(saveToFileQuality([opt('original'), opt('4k', { disabled: true, reason: 'not 4K' }), opt('1080p')], '4k', 'original')).toBe('original')
    })
})
