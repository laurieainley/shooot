import { describe, expect, it } from 'vitest'
import { OUTPUT_MARGIN, marginFor, spaceVerdict } from './space'

const GB = 1024 ** 3
const base = { what: 'full match', qualityLabel: '4K', committedBytes: 0, marginBytes: 0 }

describe('spaceVerdict', () => {
    it('should fit when the parts and the export margin fit, and when the browser will not say', () => {
        expect(spaceVerdict({ ...base, needBytes: 5 * GB, availableBytes: 6 * GB }).fits).toBe(true)
        expect(spaceVerdict({ ...base, needBytes: 50 * GB, availableBytes: null })).toMatchObject({ fits: true, message: null })
    })
    it('should say what is needed, what is free and how much to free, in GB with one decimal', () => {
        const v = spaceVerdict({ ...base, needBytes: 14.2 * GB, availableBytes: 6.1 * GB, alternative: { label: '1080p', needBytes: 4.6 * GB } })
        expect(v.fits).toBe(false)
        expect(v.message).toBe('Not enough space to prepare the full match at 4K. Needs 14.2 GB, 6.1 GB available — free about 8.1 GB on this device to enable it. (Or choose 1080p, which needs 4.6 GB.)')
    })
    it('should not suggest an alternative that would not fit either', () => {
        const v = spaceVerdict({ ...base, needBytes: 14.2 * GB, availableBytes: 3 * GB, alternative: { label: '1080p', needBytes: 4.6 * GB } })
        expect(v.message).not.toContain('Or choose')
    })
    it('should count the room the export needs in browser storage, and parts of the kind prepared before', () => {
        const parts = 10 * GB
        const margin = marginFor(parts, false)
        expect(margin).toBe(Math.round(parts * OUTPUT_MARGIN))
        expect(marginFor(parts, true)).toBe(0)
        expect(spaceVerdict({ ...base, needBytes: parts, marginBytes: margin, availableBytes: 20 * GB }).fits).toBe(false)
        expect(spaceVerdict({ ...base, needBytes: parts, marginBytes: 0, availableBytes: 20 * GB }).fits).toBe(true)
        expect(spaceVerdict({ ...base, needBytes: parts, committedBytes: 12 * GB, availableBytes: 20 * GB }).fits).toBe(false)
    })
})
