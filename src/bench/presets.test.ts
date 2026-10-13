import { describe, expect, it } from 'vitest'
import { ALL_EXPERIMENTS, PRESETS, detectPreset } from './presets'

describe('bench presets', () => {
    it('should run only experiment 11 on every preset: no stages, no other experiments, deliver off', () => {
        for (const p of Object.values(PRESETS)) {
            expect(p.stages).toEqual([])
            expect(p.experiments).toEqual(['webgpu'])
            expect(p.deliver).toBe(false)
        }
    })
    it('should keep every experiment, including WebGPU scaling, available to tick', () => {
        expect(ALL_EXPERIMENTS).toContain('webgpu')
        expect(ALL_EXPERIMENTS).toHaveLength(10)
    })
    it('should name the bench file and a duration in every instruction', () => {
        for (const p of Object.values(PRESETS)) {
            expect(p.instruction).toContain('bench-gopro-4k.mp4')
            expect(p.instruction).toMatch(/5-8 minutes/)
            expect(p.instruction).toMatch(/screen on/)
            expect(p.instruction).toMatch(/tab in front/)
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
