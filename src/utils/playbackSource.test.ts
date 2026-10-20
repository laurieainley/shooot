import { describe, it, expect, vi } from 'vitest'
import { applyPlayback, chooseSide, defaultPlaybackPref, fallBackToLrv, hasPairs, parsePlaybackPref } from './playbackSource'
import type { PairSide, SourcePair, VideoSourceFile } from '../types'

const side = (name: string, over: Partial<PairSide> = {}): PairSide => ({ file: new File([''], name), name, width: 1920, height: 1080, codec: 'hevc', ...over })
const pairOf = (over: { full?: Partial<PairSide>; proxy?: Partial<PairSide> } = {}): SourcePair =>
    ({ full: side('GX010042.MP4', over.full), proxy: side('GL010042.LRV', { width: 854, height: 480, codec: 'h264', ...over.proxy }) })
const pairedFile = (pair: SourcePair, kind: 'full' | 'proxy' = 'proxy'): VideoSourceFile => {
    const s = pair[kind]
    return { id: 'a', file: s.file, url: `blob:${s.name}`, name: s.name, durationSec: 20, width: s.width, height: s.height, kind, codec: s.codec, fullFile: pair.full.file, pair }
}
const makeUrl = (f: File): string => `blob:new-${f.name}`

describe('defaultPlaybackPref', () => {
    it('should be LRV on touch layouts and MP4 with a mouse', () => {
        expect(defaultPlaybackPref(true)).toBe('lrv')
        expect(defaultPlaybackPref(false)).toBe('mp4')
    })
    it('should accept only lrv or mp4 from storage', () => {
        expect(parsePlaybackPref('mp4')).toBe('mp4')
        expect(parsePlaybackPref('4k')).toBeNull()
        expect(parsePlaybackPref(null)).toBeNull()
    })
})

describe('chooseSide', () => {
    it('should give the side asked for when it plays', () => {
        expect(chooseSide(pairOf(), 'mp4')).toEqual({ side: 'full', fellBack: false })
        expect(chooseSide(pairOf(), 'lrv')).toEqual({ side: 'proxy', fellBack: false })
    })
    it('should fall back to the LRV when the MP4 cannot play', () => {
        expect(chooseSide(pairOf({ full: { playbackIssue: 'no HEVC' } }), 'mp4')).toEqual({ side: 'proxy', fellBack: true })
    })
    it('should keep the wanted side when neither plays', () => {
        const p = pairOf({ full: { playbackIssue: 'x' }, proxy: { playbackIssue: 'y' } })
        expect(chooseSide(p, 'mp4')).toEqual({ side: 'full', fellBack: false })
    })
})

describe('applyPlayback', () => {
    it('should swap a paired file to the MP4, keeping id, duration and the pair, and revoke the old URL', () => {
        const f = pairedFile(pairOf())
        const revoke = vi.fn()
        const r = applyPlayback([f], 'mp4', makeUrl, revoke)
        expect(r.changed).toBe(true)
        expect(r.files[0]).toMatchObject({ id: 'a', name: 'GX010042.MP4', kind: 'full', url: 'blob:new-GX010042.MP4', durationSec: 20, width: 1920, codec: 'hevc' })
        expect(r.files[0].pair).toBe(f.pair)
        expect(r.files[0].fullFile).toBe(f.fullFile)
        expect(revoke).toHaveBeenCalledWith('blob:GL010042.LRV')
    })
    it('should leave unpaired files and already-matching files untouched', () => {
        const unpaired: VideoSourceFile = { id: 'u', file: new File([''], 'a.mp4'), url: 'blob:a', name: 'a.mp4', kind: 'full' }
        const lrv = pairedFile(pairOf())
        const files = [unpaired, lrv]
        const revoke = vi.fn()
        const r = applyPlayback(files, 'lrv', makeUrl, revoke)
        expect(r.changed).toBe(false)
        expect(r.files).toBe(files)
        expect(revoke).not.toHaveBeenCalled()
    })
    it('should report a fallback when the MP4 is unplayable', () => {
        const f = pairedFile(pairOf({ full: { playbackIssue: 'no HEVC' } }))
        const r = applyPlayback([f], 'mp4', makeUrl, vi.fn())
        expect(r.changed).toBe(false)
        expect(r.fellBack).toBe(true)
    })
})

describe('fallBackToLrv', () => {
    it('should play the LRV and remember the MP4 failed', () => {
        const f = pairedFile(pairOf(), 'full')
        const next = fallBackToLrv(f, 'decode error', makeUrl, vi.fn())!
        expect(next).toMatchObject({ kind: 'proxy', name: 'GL010042.LRV', width: 854 })
        expect(next.pair!.full.playbackIssue).toBe('decode error')
        expect(chooseSide(next.pair!, 'mp4').side).toBe('proxy')
    })
    it('should do nothing for unpaired files or when the LRV is already playing', () => {
        expect(fallBackToLrv({ id: 'u', file: new File([''], 'a.mp4'), url: 'x', name: 'a.mp4', kind: 'full' }, 'x', makeUrl, vi.fn())).toBeNull()
        expect(fallBackToLrv(pairedFile(pairOf(), 'proxy'), 'x', makeUrl, vi.fn())).toBeNull()
    })
})

describe('hasPairs', () => {
    it('should be true only when a file has both', () => {
        expect(hasPairs([{}])).toBe(false)
        expect(hasPairs([{}, { pair: pairOf() }])).toBe(true)
    })
})
