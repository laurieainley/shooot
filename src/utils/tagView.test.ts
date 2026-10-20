import { describe, expect, it } from 'vitest'
import type { Suggestion } from '../types'
import { CONTROLS_FADE_MS, fadeDelayMs, jumpStartSec, nextMoment, pendingMoments, prevMoment, tagViewMode } from './tagView'

const sug = (id: string, t: number, status: Suggestion['status'] = 'pending'): Suggestion => ({ id, globalTimeSec: t, score: 1, source: 'audio', status })
const base = { coarse: true, layout: 'landscape' as const, fullscreen: false, hasFiles: true }

describe('tagViewMode', () => {
    it('should leave a mouse layout alone', () => {
        expect(tagViewMode({ ...base, coarse: false, layout: 'desktop' })).toBe('off')
        expect(tagViewMode({ ...base, coarse: false, fullscreen: true })).toBe('off')
    })
    it('should overlay a phone held sideways and a tablet on its side', () => {
        expect(tagViewMode(base)).toBe('overlay')
        expect(tagViewMode({ ...base, layout: 'desktop' })).toBe('overlay')
    })
    it('should overlay any touch fullscreen', () => {
        expect(tagViewMode({ ...base, layout: 'phone', fullscreen: true })).toBe('overlay')
        expect(tagViewMode({ ...base, layout: 'tablet', fullscreen: true })).toBe('overlay')
    })
    it('should use the band under the picture on a portrait phone and an upright tablet', () => {
        expect(tagViewMode({ ...base, layout: 'phone' })).toBe('band')
        expect(tagViewMode({ ...base, layout: 'tablet' })).toBe('band')
    })
    it('should stay on today\'s page until a video is loaded', () => {
        expect(tagViewMode({ ...base, hasFiles: false })).toBe('off')
    })
})

describe('fadeDelayMs', () => {
    it('should fade while playing over the picture', () => {
        expect(fadeDelayMs({ mode: 'overlay', paused: false, tagging: false })).toBe(CONTROLS_FADE_MS)
    })
    it('should never fade while paused or tagging', () => {
        expect(fadeDelayMs({ mode: 'overlay', paused: true, tagging: false })).toBeNull()
        expect(fadeDelayMs({ mode: 'overlay', paused: false, tagging: true })).toBeNull()
    })
    it('should never fade when the controls are not over the picture', () => {
        expect(fadeDelayMs({ mode: 'band', paused: false, tagging: false })).toBeNull()
        expect(fadeDelayMs({ mode: 'off', paused: false, tagging: false })).toBeNull()
    })
})

describe('found moments', () => {
    const all = [sug('c', 300), sug('a', 100), sug('b', 200, 'rejected'), sug('d', 50)]
    const pending = pendingMoments(all, new Set())
    it('should list pending moments in match order', () => {
        expect(pending.map((m) => m.id)).toEqual(['d', 'a', 'c'])
    })
    it('should count a kept moment whose event is gone as pending again', () => {
        const kept = { ...sug('k', 10, 'kept'), eventId: 'e1' }
        expect(pendingMoments([kept], new Set()).map((m) => m.id)).toEqual(['k'])
        expect(pendingMoments([kept], new Set(['e1']))).toEqual([])
    })
    it('should jump 6 s before a moment, never before the start', () => {
        expect(jumpStartSec(sug('x', 100))).toBe(94)
        expect(jumpStartSec(sug('x', 3))).toBe(0)
    })
    it('should find the next moment ahead of the playhead', () => {
        expect(nextMoment(pending, 0)?.id).toBe('d')
        expect(nextMoment(pending, 60)?.id).toBe('a')
        expect(nextMoment(pending, 295)).toBeNull()
    })
    it('should not call the moment being watched "next"', () => {
        expect(nextMoment(pending, 94)?.id).toBe('c') // landed on a's jump point
        expect(nextMoment(pending, 97)?.id).toBe('c')
    })
    it('should find the previous moment, restarting one being watched', () => {
        expect(prevMoment(pending, 0)).toBeNull()
        expect(prevMoment(pending, 97)?.id).toBe('a')
        expect(prevMoment(pending, 94)?.id).toBe('d')
        expect(prevMoment(pending, 500)?.id).toBe('c')
    })
})
