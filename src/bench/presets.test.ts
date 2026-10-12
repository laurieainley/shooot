import { describe, expect, it } from 'vitest'
import { ALL_EXPERIMENTS, PRESETS, detectPreset } from './presets'

describe('bench presets', () => {
    it('should run the 1080p stage and every experiment but direct save on the iPad and the Pixel', () => {
        for (const id of ['ipad', 'pixel'] as const) {
            expect(PRESETS[id].stages).toEqual(['reencode1080'])
            expect(PRESETS[id].experiments).not.toContain('directSave')
            expect(PRESETS[id].experiments).toHaveLength(ALL_EXPERIMENTS.length - 1)
            expect(PRESETS[id].deliver).toBe(true)
        }
    })
    it('should flag the graphics experiments on the Pixel', () => {
        expect(PRESETS.pixel.highlight).toEqual(['overlayCache', 'tightSpans'])
    })
    it('should run both re-encode stages and all experiments, including direct save, on the Mac', () => {
        expect(PRESETS.mac.stages).toEqual(['reencode1080', 'reencode4k'])
        expect(PRESETS.mac.experiments).toEqual(ALL_EXPERIMENTS)
    })
    it('should name the bench file and a duration in every instruction', () => {
        for (const p of Object.values(PRESETS)) {
            expect(p.instruction).toContain('bench-gopro-4k.mp4')
            expect(p.instruction).toMatch(/\d+-\d+ minutes/)
        }
    })
    it('should detect the device from the user agent', () => {
        expect(detectPreset({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' })).toBe('pixel')
        expect(detectPreset({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140 Mobile/15E148 Safari/604.1' })).toBe('ipad')
        expect(detectPreset({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ipad')
        expect(detectPreset({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac')
        expect(detectPreset({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140' })).toBeNull()
    })
})
