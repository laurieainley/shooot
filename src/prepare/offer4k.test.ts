// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { accept4k, offer4k, fullLongSide } from './offer4k'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

const f = (name: string, w: number, h: number, extra: Partial<VideoSourceFile> = {}): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), kind: 'full', width: w, height: h, ...extra })
const pair = (full: [number, number], proxy: [number, number]): VideoSourceFile => {
    const side = (n: string, d: [number, number]) => ({ file: new File([''], n), name: n, width: d[0], height: d[1] })
    return f('GL010042.LRV', proxy[0], proxy[1], { kind: 'proxy', pair: { full: side('GX010042.MP4', full), proxy: side('GL010042.LRV', proxy) } })
}

describe('offer4k', () => {
    it('should offer 4K for Original with a 4K MP4 loaded', () => {
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('a.mp4', 3840, 2160)] })).toBe(true)
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('a.mp4', 3840, 2160, { width: 3840, height: 2160 })] })).toBe(true)
    })
    it('should offer it while a 4K MP4 of a pair is the file behind the LRV being played', () => {
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [pair([3840, 2160], [854, 480])] })).toBe(true)
        expect(fullLongSide(pair([3840, 2160], [854, 480]))).toBe(3840)
    })
    it('should not offer it for 1080p footage, LRV only, or a 1080p pair', () => {
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('a.mp4', 1920, 1080)] })).toBe(false)
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('GL010042.LRV', 3840, 2160, { kind: 'proxy' })] })).toBe(false)
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [pair([1920, 1080], [854, 480])] })).toBe(false)
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [] })).toBe(false)
    })
    it('should not offer it when the setting is already 4K or 1080p', () => {
        expect(offer4k({ fullMatchQuality: '4k', highlightsQuality: 'auto', files: [f('a.mp4', 3840, 2160)] })).toBe(false)
        expect(offer4k({ fullMatchQuality: '1080p', highlightsQuality: 'auto', files: [f('a.mp4', 3840, 2160)] })).toBe(false)
    })
    it('should judge the first file, the one the preparer plans from', () => {
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('a.mp4', 1920, 1080), f('b.mp4', 3840, 2160)] })).toBe(false)
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('a.mp4', 3840, 2160), f('b.mp4', 1920, 1080)] })).toBe(true)
    })
    it('should accept a slightly short 4K frame (3824 wide)', () => {
        expect(offer4k({ fullMatchQuality: 'original', highlightsQuality: 'auto', files: [f('a.mp4', 3824, 2160)] })).toBe(true)
    })
})

describe('accept4k', () => {
    beforeEach(() => { useAppState.setState({ fullMatch: { ...useAppState.getState().fullMatch, quality: 'original' }, highlightsQuality: 'auto' }) })
    it('should set the full match to 4K and highlights to 4K when they were on auto', () => {
        accept4k()
        expect(useAppState.getState().fullMatch.quality).toBe('4k')
        expect(useAppState.getState().highlightsQuality).toBe('4k')
    })
    it('should leave an explicit highlights choice alone', () => {
        useAppState.setState({ highlightsQuality: '1080p' })
        accept4k()
        expect(useAppState.getState().fullMatch.quality).toBe('4k')
        expect(useAppState.getState().highlightsQuality).toBe('1080p')
    })
})
